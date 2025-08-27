import type { NextApiRequest, NextApiResponse } from "next";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import formidable from "formidable";

export const config = {
  api: {
    responseLimit: false,   // we stream/pipe or send buffers > 4MB
    bodyParser: false,      // we use formidable for multipart & raw
    externalResolver: true,
  },
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function normalizeLeagueUrl(input: string): string {
  const u = new URL(input.trim());

  if (u.hostname.endsWith("dropbox.com")) {
    u.hostname = "dl.dropboxusercontent.com";
    u.searchParams.set("dl", "1");
    u.searchParams.delete("st");
  }
  if (u.hostname === "dl.dropboxusercontent.com") u.searchParams.delete("st");

  if (u.hostname === "github.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[2] === "blob" && parts.length >= 5) {
      const [user, repo, _blob, branch, ...rest] = parts;
      u.hostname = "raw.githubusercontent.com";
      u.pathname = `/${user}/${repo}/${branch}/${rest.join("/")}`;
      u.search = "";
    }
  }

  if (u.hostname === "gist.github.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const [user, hash] = parts;
      u.hostname = "gist.githubusercontent.com";
      u.pathname = `/${user}/${hash}/raw`;
      u.search = "";
    }
  }

  if (u.hostname === "drive.google.com" && u.pathname.startsWith("/file/")) {
    const id = u.pathname.split("/")[3];
    u.pathname = "/uc";
    u.search = "";
    u.searchParams.set("export", "download");
    u.searchParams.set("id", id);
  }

  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs are allowed.");
  return u.toString();
}

function sniffIsGzip(buf: Uint8Array) {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

async function parseMultipart(req: NextApiRequest): Promise<Uint8Array> {
  const form = formidable({ multiples: false, keepExtensions: true });
  const { files } = await new Promise<any>((resolve, reject) => {
    form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
  });

  const fileObj = files.file || files.upload || Object.values(files)[0];
  if (!fileObj) throw new Error("No file provided");

  // formidable v3+ may return an array
  const f = Array.isArray(fileObj) ? fileObj[0] : fileObj;
  const filepath = f.filepath || f.path;

  const data = await fsp.readFile(filepath);
  // Clean up temp file just in case
  fsp.unlink(filepath).catch(() => {});
  return new Uint8Array(data);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const urlParam = typeof req.query.url === "string" ? req.query.url : "";
      if (!urlParam) return res.status(400).json({ error: "Missing ?url=" });

      const normalized = normalizeLeagueUrl(urlParam);
      const remote = await fetch(normalized, {
        redirect: "follow",
        headers: { "User-Agent": UA, Accept: "*/*", "Accept-Encoding": "identity" },
      });

      if (!remote.ok || !remote.body) {
        return res
          .status(remote.status || 502)
          .json({ error: `Fetch failed: remote ${remote.status} ${remote.statusText}` });
      }

      res.setHeader("Content-Type", remote.headers.get("content-type") || "application/octet-stream");
      const ce = remote.headers.get("content-encoding");
      if (ce) res.setHeader("X-Content-Encoding", ce);
      res.setHeader("Cache-Control", "no-store");

      // @ts-ignore Node stream piping
      remote.body.pipe(res);
      return;
    }

    if (req.method === "POST") {
      const ct = req.headers["content-type"] || "";
      let bytes: Uint8Array;

      if (typeof ct === "string" && ct.includes("multipart/form-data")) {
        bytes = await parseMultipart(req);
      } else {
        // raw octet-stream
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve());
          req.on("error", reject);
        });
        bytes = new Uint8Array(Buffer.concat(chunks));
      }

      res.setHeader("Content-Type", "application/octet-stream");
      if (sniffIsGzip(bytes)) res.setHeader("X-Content-Encoding", "gzip");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(Buffer.from(bytes));
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message || err) });
  }
}