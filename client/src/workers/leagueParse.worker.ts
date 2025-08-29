import { gunzip } from "fflate";
const isGzip = (u8: Uint8Array) => u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;

self.onmessage = async (e: MessageEvent) => {
  try {
    const { bytes, hinted } = e.data as { bytes: ArrayBuffer; hinted?: "gzip" | null };
    let u8 = new Uint8Array(bytes); // transferred, zero-copy

    if (hinted === "gzip" || isGzip(u8)) {
      u8 = await new Promise<Uint8Array>((resolve, reject) => {
        gunzip(u8, (err, out) => (err ? reject(err) : resolve(out)));
      });
    }

    const text = new TextDecoder().decode(u8);
    const league = JSON.parse(text);
    (self as any).postMessage({ ok: true, league });
  } catch (err: any) {
    (self as any).postMessage({ ok: false, error: String(err?.message || err) });
  }
};