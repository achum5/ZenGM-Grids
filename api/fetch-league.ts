import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const rawUrl = String(req.query.url || "");
    if (!rawUrl) return res.status(400).json({ error: "missing url param" });

    // Normalize URLs (handle Dropbox, GitHub links)
    function normalize(input: string) {
      try {
        const u = new URL(input);
        if (u.hostname.includes("dropbox") && !u.hostname.includes("dropboxusercontent.com")) {
          u.hostname = "dl.dropboxusercontent.com";
          u.searchParams.set("dl", "1");
          ["st", "rlkey"].forEach(q => u.searchParams.delete(q));
          return u.toString();
        }
        if (u.hostname === "github.com" && u.pathname.includes("/blob/")) {
          u.hostname = "raw.githubusercontent.com";
          u.pathname = u.pathname.replace("/blob/", "/");
          return u.toString();
        }
        return input;
      } catch { return input; }
    }

    const url = normalize(rawUrl);
    console.log('🔗 Fetching URL:', url);
    
    const r = await fetch(url, { redirect: "follow" });
    const buf = Buffer.from(await r.arrayBuffer());

    if (!r.ok) {
      let text = "";
      try { text = buf.toString("utf8").slice(0, 200); } catch {}
      return res.status(r.status).send(text || `Remote error ${r.status}`);
    }

    const u8 = new Uint8Array(buf);
    const gzip = u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Content-Encoding", gzip ? "gzip" : "identity");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.send(buf);
  } catch (e: any) {
    console.error('❌ fetch-league error:', e);
    return res.status(500).json({ error: e?.message ?? "internal error" });
  }
}