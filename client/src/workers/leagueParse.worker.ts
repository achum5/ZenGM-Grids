import { gunzip } from "fflate";

function isGzip(u8: Uint8Array) { return u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b; }
const gunzipAsync = (u8: Uint8Array) => new Promise<Uint8Array>((res, rej) => gunzip(u8, (e, out) => e ? rej(e) : res(out)));

self.onmessage = async (e: MessageEvent) => {
  try {
    const { bytes, hinted } = e.data as { bytes: ArrayBuffer; hinted?: "gzip" | null };
    let u8 = new Uint8Array(bytes); // transferred, zero-copy
    if (hinted === "gzip" || isGzip(u8)) u8 = await gunzipAsync(u8);
    const text = new TextDecoder().decode(u8);
    const league = JSON.parse(text);
    (self as any).postMessage({ ok: true, league });
  } catch (err: any) {
    (self as any).postMessage({ ok: false, error: String(err?.message || err) });
  }
};