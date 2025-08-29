import { gunzipSync } from "fflate";

// URL -> bytes via our Vercel function
export async function fetchLeagueBytesViaVercel(rawUrl: string) {
  const r = await fetch(`/api/fetch-league?url=${encodeURIComponent(rawUrl)}`);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`URL fetch failed (${r.status}): ${t || r.statusText}`);
  }
  const hinted = r.headers.get("x-content-encoding") as ("gzip" | null);
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { bytes, hinted };
}

// Local file -> bytes
export async function fileToBytes(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hinted = file.name.toLowerCase().endsWith(".gz") ? ("gzip" as const) : null;
  return { bytes, hinted };
}

// Bytes -> JSON (handles .gz)
export function parseLeague(bytes: Uint8Array, hinted?: "gzip" | null) {
  const isGz = hinted === "gzip" || (bytes[0] === 0x1f && bytes[1] === 0x8b);
  const raw = isGz ? gunzipSync(bytes) : bytes;
  const text = new TextDecoder().decode(raw);
  return JSON.parse(text);
}