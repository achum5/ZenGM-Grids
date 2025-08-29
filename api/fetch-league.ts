import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Readable } from "node:stream";

export const config = { maxDuration: 60 };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function normalize(input: string) {
  const u = new URL(input.trim());

  // Dropbox → direct (keep tokens; force dl=1)
  if (
    u.hostname === "www.dropbox.com" ||
    u.hostname === "dropbox.com" ||
    u.hostname === "dl.dropbox.com" ||
    u.hostname.endsWith("dropbox.com")
  ) {
    u.hostname = "dl.dropboxusercontent.com";
    u.searchParams.set("dl", "1");
  }

  // GitHub blob → raw
  if (u.hostname === "github.com") {
    const p = u.pathname.split("/").filter(Boolean);
    if (p.length >= 5 && p[2] === "blob") {
      const [user, repo, _blob, branch, ...rest] = p;
      u.hostname = "raw.githubusercontent.com";
      u.pathname = `/${user}/${repo}/${branch}/${rest.join("/")}`;
      u.search = "";
    }
  }

  // Gist page → raw
  if (u.hostname === "gist.github.com") {
    const p = u.pathname.split("/").filter(Boolean);
    if (p.length >= 2) {
      const [user, hash] = p;
      u.hostname = "gist.githubusercontent.com";
      u.pathname = `/${user}/${hash}/raw`;
      u.search = "";
    }
  }

  // Google Drive file → direct
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = typeof req.query.url === "string" ? req.query.url : "";
    if (!url) return res.status(400).json({ error: "Missing ?url=" });

    const normalized = normalize(url);
    const looksGzipByExt = /\.json\.gz$|\.gz$/i.test(new URL(normalized).pathname);

    const upstream = await fetch(normalized, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "*/*", "Accept-Encoding": "identity" }, // avoid extra gzip
    });

    if (!upstream.ok || !upstream.body) {
      return res
        .status(upstream.status || 502)
        .json({ error: `Fetch failed: remote ${upstream.status} ${upstream.statusText}` });
    }

    const ct = upstream.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", ct);

    // Hint gzip to client even if server omits Content-Encoding
    const ce = upstream.headers.get("content-encoding");
    const isGzipType = /\b(gzip|x-gzip)\b/i.test(ct) || /application\/(gzip|x-gzip)/i.test(ct);
    if (ce) res.setHeader("X-Content-Encoding", ce);
    else if (looksGzipByExt || isGzipType) res.setHeader("X-Content-Encoding", "gzip");

    res.setHeader("Cache-Control", "no-store");
    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message || e) });
  }
}