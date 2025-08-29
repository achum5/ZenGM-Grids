// Runs in a Web Worker. Streaming gunzip + decode to a single string (no giant byte buffer)
// Then JSON.parse and post back. Avoids main-thread memory spikes.

import { AsyncGunzip } from "fflate";

type MsgIn = { buffer: ArrayBuffer; hinted?: "gzip" | null };
type MsgOut =
  | { ok: true; league: any }
  | { ok: false; error: string };

const td = new TextDecoder();

function isGzip(u8: Uint8Array) {
  return u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;
}

self.onmessage = async (e: MessageEvent<MsgIn>) => {
  try {
    let u8 = new Uint8Array(e.data.buffer); // transferred from main
    const hinted = e.data.hinted;

    // If not gzip, decode directly
    if (!(hinted === "gzip" || isGzip(u8))) {
      const text = td.decode(u8);
      const league = JSON.parse(text);
      (self as any).postMessage({ ok: true, league } as MsgOut);
      return;
    }

    // Stream gunzip to avoid allocating one giant decompressed buffer
    const gunzip = new AsyncGunzip();
    const chunks: string[] = [];

    gunzip.ondata = (chunk, final) => {
      chunks.push(td.decode(chunk, { stream: !final }));
      if (final) {
        try {
          const text = chunks.join("");
          const league = JSON.parse(text);

          // Optional thinning to save RAM; uncomment only if you still hit OOM
          // if (league?.gameAttributes) {
          //   delete league.gameAttributes.events;
          //   delete league.gameAttributes.boxScores;
          //   delete league.gameAttributes.schedule;
          // }

          (self as any).postMessage({ ok: true, league } as MsgOut);
        } catch (err: any) {
          (self as any).postMessage({ ok: false, error: String(err?.message || err) } as MsgOut);
        }
      }
    };

    gunzip.onerr = (msg, code) => {
      (self as any).postMessage({ ok: false, error: `${msg} (${code})` } as MsgOut);
    };

    // Feed compressed data; true = final chunk
    gunzip.push(u8, true);
  } catch (err: any) {
    (self as any).postMessage({ ok: false, error: String(err?.message || err) } as MsgOut);
  }
};