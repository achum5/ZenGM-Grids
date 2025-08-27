import type { VercelRequest, VercelResponse } from "@vercel/node";
import formidable from "formidable";
import { promises as fsp } from "node:fs";
import { Readable } from "node:stream";

export const config = { maxDuration: 60 }; // extend function timeout

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function normalizeLeagueUrl(input: string): string {
  const u = new URL(input.trim());

  // Dropbox share -> direct
  if (u.hostname.endsWith("dropbox.com")) {
    u.hostname = "dl.dropboxusercontent.com";
    u.searchParams.set("dl", "1");
    u.searchParams.delete("st");
  }
  if (u.hostname === "dl.dropboxusercontent.com") {
    u.searchParams.delete("st");
  }

  // GitHub blob -> raw
  if (u.hostname === "github.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 5 && parts[2] === "blob") {
      const [user, repo, _blob, branch, ...rest] = parts;
      u.hostname = "raw.githubusercontent.com";
      u.pathname = `/${user}/${repo}/${branch}/${rest.join("/")}`;
      u.search = "";
    }
  }

  // Gist page -> raw
  if (u.hostname === "gist.github.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const [user, hash] = parts;
      u.hostname = "gist.githubusercontent.com";
      u.pathname = `/${user}/${hash}/raw`;
      u.search = "";
    }
  }

  // Google Drive file -> direct
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

async function parseMultipart(req: VercelRequest): Promise<Uint8Array> {
  const form = formidable({ multiples: false, keepExtensions: true });
  const { files } = await new Promise<any>((resolve, reject) => {
    form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
  });

  const fileObj = (files as any).file || (files as any).upload || Object.values(files)[0];
  if (!fileObj) throw new Error("No file provided");
  const f = Array.isArray(fileObj) ? fileObj[0] : fileObj;
  const filepath = f.filepath || f.path;
  const data = await fsp.readFile(filepath);
  // best-effort cleanup
  fsp.unlink(filepath).catch(() => {});
  return new Uint8Array(data);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const url = typeof req.query.url === "string" ? req.query.url : "";
      if (!url) return res.status(400).json({ error: "Missing ?url=" });

      const normalized = normalizeLeagueUrl(url);
      const normURL = new URL(normalized);
      const looksGzipByExt = /\.json\.gz$|\.gz$/i.test(normURL.pathname);

      const remote = await fetch(normalized, {
        redirect: "follow",
        headers: { "User-Agent": UA, Accept: "*/*", "Accept-Encoding": "identity" }
      });

      if (!remote.ok || !remote.body) {
        return res
          .status(remote.status || 502)
          .json({ error: `Fetch failed: remote ${remote.status} ${remote.statusText}` });
      }

      const ct = remote.headers.get("content-type") || "application/octet-stream";
      res.setHeader("Content-Type", ct);
      const ce = remote.headers.get("content-encoding");

      // if Dropbox doesn't declare gzip, hint it based on extension or content-type
      const isGzipType =
        /\b(gzip|x-gzip)\b/i.test(ct) || /application\/(gzip|x-gzip)/i.test(ct);

      if (ce) {
        res.setHeader("X-Content-Encoding", ce);
      } else if (looksGzipByExt || isGzipType) {
        res.setHeader("X-Content-Encoding", "gzip");
      }

      res.setHeader("Cache-Control", "no-store");

      const nodeStream = Readable.fromWeb(remote.body as any);
      nodeStream.pipe(res);
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
    res.status(405).send("Method Not Allowed");
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message || err) });
  }
}