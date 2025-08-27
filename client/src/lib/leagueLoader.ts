import { gunzipSync } from "fflate";

export function sniffIsGzip(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export async function bytesFromUrl(inputUrl: string) {
  const r = await fetch(`/api/fetch-league?url=${encodeURIComponent(inputUrl)}`);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`URL fetch failed (${r.status}): ${text || r.statusText}`);
  }
  const hinted = r.headers.get("x-content-encoding");
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { bytes, hintedEncoding: (hinted as "gzip" | null) || null };
}

export async function bytesFromFile(file: File) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const hinted = file.name.toLowerCase().endsWith(".gz") ? "gzip" : null;
  return { bytes, hintedEncoding: hinted as "gzip" | null };
}

export function toJson(bytes: Uint8Array, hinted?: "gzip" | null) {
  const shouldGunzip = hinted === "gzip" || sniffIsGzip(bytes);
  const raw = shouldGunzip ? gunzipSync(bytes) : bytes;
  const text = new TextDecoder().decode(raw);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON data received");
  }
}