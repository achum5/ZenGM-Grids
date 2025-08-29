import { gunzipSync } from "fflate";

// Normalize host links to direct-file URLs

export function normalizeLeagueUrl(input: string): string {
  const u = new URL(input.trim());

  // --- Dropbox: keep all params (st, rlkey, etc), just force direct download
  if (
    u.hostname === "www.dropbox.com" ||
    u.hostname === "dropbox.com" ||
    u.hostname === "dl.dropbox.com" ||
    u.hostname.endsWith("dropbox.com")
  ) {
    u.hostname = "dl.dropboxusercontent.com";
    u.searchParams.set("dl", "1");
  }

  // --- GitHub blob -> raw
  if (u.hostname === "github.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 5 && parts[2] === "blob") {
      const [user, repo, _blob, branch, ...rest] = parts;
      u.hostname = "raw.githubusercontent.com";
      u.pathname = `/${user}/${repo}/${branch}/${rest.join("/")}`;
      u.search = "";
    }
  }

  // --- Gist page -> raw
  if (u.hostname === "gist.github.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const [user, hash] = parts;
      u.hostname = "gist.githubusercontent.com";
      u.pathname = `/${user}/${hash}/raw`;
      u.search = "";
    }
  }

  // --- Google Drive file -> direct
  if (u.hostname === "drive.google.com" && u.pathname.startsWith("/file/")) {
    const id = u.pathname.split("/")[3];
    u.pathname = "/uc";
    u.search = "";
    u.searchParams.set("export", "download");
    u.searchParams.set("id", id);
  }

  if (!/^https?:$/.test(u.protocol)) {
    throw new Error("Only http(s) URLs are allowed.");
  }
  return u.toString();
}

export function isGzip(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

// URL → bytes via our API proxy (same path in preview & Vercel)
export async function fetchLeagueBytes(rawUrl: string) {
  const r = await fetch(`/api/fetch-league?url=${encodeURIComponent(rawUrl)}`);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`URL fetch failed (${r.status}): ${text || r.statusText}`);
  }
  const hinted = r.headers.get("x-content-encoding");
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { bytes, hintedEncoding: (hinted as "gzip" | null) || null };
}

// Local file → bytes (no server POSTs)
export async function fileToBytes(file: File) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const hinted = file.name.toLowerCase().endsWith(".gz") ? "gzip" : null;
  return { bytes, hintedEncoding: (hinted as "gzip" | null) };
}

// Bytes → JSON (handles .gz)
// Synchronous fallback (small files)
export function parseLeagueSync(bytes: Uint8Array, hinted?: "gzip" | null) {
  const needGunzip = hinted === "gzip" || (bytes[0] === 0x1f && bytes[1] === 0x8b);
  const raw = needGunzip ? gunzipSync(bytes) : bytes;
  const text = new TextDecoder().decode(raw);
  return JSON.parse(text);
}

// Worker-based parsing for large files
export async function parseLeagueInWorker(bytes: Uint8Array, hinted: "gzip" | null) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const worker = new Worker(new URL("../workers/leagueParse.worker.ts", import.meta.url), { type: "module" });
  return new Promise<any>((resolve, reject) => {
    const cleanup = () => worker.terminate();
    worker.onmessage = (e) => { 
      cleanup(); 
      const { ok, league, error } = e.data || {}; 
      ok ? resolve(league) : reject(new Error(error || "Parse failed")); 
    };
    worker.onerror = (ev) => { 
      cleanup(); 
      reject(new Error(ev.message || "Worker error")); 
    };
    worker.postMessage({ bytes: ab, hinted }, [ab as any]); // transfer
  });
}


export async function bytesFromUrl(rawUrl: string): Promise<Uint8Array> {
  const url = normalizeLeagueUrl(rawUrl);
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Remote ${r.status} ${r.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}

export async function bytesFromFile(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

export function parseLeagueBytes(bytes: Uint8Array, filenameHint?: string) {
  const looksGzByName = !!filenameHint?.toLowerCase().endsWith(".gz");
  const raw = (looksGzByName || isGzip(bytes)) ? gunzipSync(bytes) : bytes;
  const text = new TextDecoder().decode(raw);

  try {
    return JSON.parse(text);
  } catch (e: any) {
    // If we accidentally fetched an HTML page, surface the first chars to diagnose
    const sample = text.slice(0, 80);
    throw new Error(`Invalid JSON data received${sample ? ` — starts with: ${JSON.stringify(sample)}` : ""}`);
  }
}