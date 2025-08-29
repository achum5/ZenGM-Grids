import { gunzipSync } from "fflate";

export async function fetchLeagueBytes(url: string) {
  const r = await fetch(`/api/fetch-league?url=${encodeURIComponent(url)}`);
  if (!r.ok) { const t = await r.text().catch(()=>""); throw new Error(`URL fetch failed (${r.status}): ${t || r.statusText}`); }
  const hinted = r.headers.get("x-content-encoding") as ("gzip" | null);
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { bytes, hinted };
}

export async function fileToBytes(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hinted = file.name.toLowerCase().endsWith(".gz") ? ("gzip" as const) : null;
  return { bytes, hinted };
}

// optional small-file sync
export function parseLeagueSync(bytes: Uint8Array, hinted?: "gzip" | null) {
  const needGz = hinted === "gzip" || (bytes[0] === 0x1f && bytes[1] === 0x8b);
  const raw = needGz ? gunzipSync(bytes) : bytes;
  const text = new TextDecoder().decode(raw);
  return JSON.parse(text);
}

export async function parseLeagueInWorker(bytes: Uint8Array, hinted: "gzip" | null) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const worker = new Worker(new URL("../workers/leagueParse.worker.ts", import.meta.url), { type: "module" });
  return new Promise<any>((resolve, reject) => {
    const done = () => worker.terminate();
    worker.onmessage = (e) => { done(); const { ok, league, error } = e.data || {}; ok ? resolve(league) : reject(new Error(error || "Parse failed")); };
    worker.onerror = (ev) => { done(); reject(new Error(ev.message || "Worker error")); };
    worker.postMessage({ bytes: ab, hinted }, [ab as any]); // transfer
  });
}