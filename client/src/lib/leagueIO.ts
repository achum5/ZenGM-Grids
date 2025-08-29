import { gunzipSync } from "fflate";

// NOTE: keep these two fetch/read helpers from earlier:

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

export async function fileToBytes(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hinted = file.name.toLowerCase().endsWith(".gz") ? ("gzip" as const) : null;
  return { bytes, hinted };
}

// FAST path for small files (still available if you want it)
export function parseLeague(bytes: Uint8Array, hinted?: "gzip" | null) {
  const gz = hinted === "gzip" || (bytes[0] === 0x1f && bytes[1] === 0x8b);
  const raw = gz ? gunzipSync(bytes) : bytes;
  const text = new TextDecoder().decode(raw);
  return JSON.parse(text);
}

// SAFE path for big files: off-main-thread + streaming gunzip (prevents OOM)
export function parseLeagueInWorker(bytes: Uint8Array, hinted?: "gzip" | null): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/leagueParse.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (ev: MessageEvent<{ ok: boolean; league?: any; error?: string }>) => {
      if (ev.data.ok) resolve(ev.data.league);
      else reject(new Error(ev.data.error || "Worker parse failed"));
      worker.terminate();
    };
    worker.onerror = (e) => {
      reject(new Error(e.message || "Worker error"));
      worker.terminate();
    };

    // Transfer the underlying buffer to avoid copying
    worker.postMessage({ buffer: bytes.buffer, hinted: hinted ?? null }, [bytes.buffer]);
  });
}