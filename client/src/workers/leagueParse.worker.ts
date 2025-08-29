// Worker: fetch/decompress/parse big BBGM leagues without main-thread memory spikes.
// - URL case: worker fetches /api/fetch-league?url=... (no big ArrayBuffer on main)
// - File case: pass File/Blob to worker; stream it through DecompressionStream if needed
// - Thins known heavy props before posting back to reduce memory.

import { AsyncGunzip } from "fflate";

type MsgIn =
  | { kind: "url"; url: string; hinted?: "gzip" | null }
  | { kind: "file"; file: Blob; hinted?: "gzip" | null };

type MsgOut = { ok: true; league: any } | { ok: false; error: string };

function isGzip(u8: Uint8Array) {
  return u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  // Let the browser handle decoding to text
  return await new Response(stream).text();
}

async function gunzipStream(stream: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
  if (typeof (self as any).DecompressionStream === "function") {
    // Native streaming gunzip
    const ds = new (self as any).DecompressionStream("gzip");
    return stream.pipeThrough(ds) as ReadableStream<Uint8Array>;
  }
  // Fallback: fflate AsyncGunzip → return a readable stream
  const reader = stream.getReader();
  const gunzip = new AsyncGunzip();
  let controllerResolve: (s: ReadableStream<Uint8Array>) => void;
  const out = new ReadableStream<Uint8Array>({
    start(controller) {
      gunzip.ondata = (chunk) => controller.enqueue(chunk);
      gunzip.onerr = (msg, code) => controller.error(new Error(`${msg} (${code})`));
      gunzip.onend = () => controller.close();
      controllerResolve = () => {};
    },
  });
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        gunzip.push(value, false);
      }
      gunzip.push(new Uint8Array(0), true);
    } catch (e) {
      // If anything goes wrong while reading/pushing
      (out as any).cancel?.(e);
    }
  })();
  return out;
}

function thinLeagueInPlace(league: any) {
  // Keep the parts you actually need; drop huge history to avoid OOM.
  // Adjust this list as needed—it's safe: we don't touch UI/game code here.
  const dropTopLevel = [
    "events", "games", "gameStats", "boxScores", "schedule",
    "playoffSeries", "releasedPlayers", "awards",
    "draftLotteryResults", "allStars", "messages",
  ];
  for (const k of dropTopLevel) {
    if (k in league) delete league[k];
  }
  // If there are season arrays, drop deep history if you don't need it
  if (Array.isArray(league?.teams)) {
    for (const t of league.teams) {
      if (Array.isArray(t?.seasons) && t.seasons.length > 4) {
        t.seasons = t.seasons.slice(-4); // last 4 seasons only
      }
      if (Array.isArray(t?.stats) && t.stats.length > 6) {
        t.stats = t.stats.slice(-6);
      }
    }
  }
  if (Array.isArray(league?.players)) {
    for (const p of league.players) {
      if (Array.isArray(p?.stats) && p.stats.length > 10) {
        p.stats = p.stats.slice(-10);
      }
      if (Array.isArray(p?.injuries) && p.injuries.length > 10) {
        p.injuries = p.injuries.slice(-10);
      }
    }
  }
}

self.onmessage = async (e: MessageEvent<MsgIn>) => {
  try {
    let stream: ReadableStream<Uint8Array>;
    let hinted = e.data.hinted ?? null;

    if (e.data.kind === "url") {
      const r = await fetch(`/api/fetch-league?url=${encodeURIComponent(e.data.url)}`);
      if (!r.ok) throw new Error(`URL fetch failed (${r.status})`);
      hinted = (r.headers.get("x-content-encoding") as ("gzip" | null)) ?? hinted;
      stream = r.body as ReadableStream<Uint8Array>;
      if (!stream) throw new Error("Readable stream not available from fetch");
    } else {
      // File/Blob path
      stream = (e.data.file as Blob).stream() as ReadableStream<Uint8Array>;
    }

    // Peek first bytes to detect gzip when not hinted
    const tee = stream.tee();
    const reader = tee[0].getReader();
    const first = await reader.read();
    reader.releaseLock();
    stream = tee[1];

    let useStream = stream;
    if (hinted === "gzip" || (first.value && isGzip(first.value))) {
      useStream = await gunzipStream(stream);
    }

    const text = await streamToText(useStream);
    const league = JSON.parse(text);

    // Thin big fields to keep memory low
    thinLeagueInPlace(league);

    (self as any).postMessage({ ok: true, league } as MsgOut);
  } catch (err: any) {
    (self as any).postMessage({ ok: false, error: String(err?.message || err) } as MsgOut);
  }
};