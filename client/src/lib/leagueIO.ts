// Helper: dispatch work to the worker. No ArrayBuffer allocations on main thread.

export function parseLeagueFromUrlInWorker(url: string, hinted?: "gzip" | null): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/leagueParse.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<{ ok: boolean; league?: any; error?: string }>) => {
      if (ev.data.ok) resolve(ev.data.league);
      else reject(new Error(ev.data.error || "Worker parse failed"));
      worker.terminate();
    };
    worker.onerror = (e) => { reject(new Error(e.message || "Worker error")); worker.terminate(); };
    worker.postMessage({ kind: "url", url, hinted: hinted ?? null });
  });
}

export function parseLeagueFromFileInWorker(file: File, hinted?: "gzip" | null): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/leagueParse.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<{ ok: boolean; league?: any; error?: string }>) => {
      if (ev.data.ok) resolve(ev.data.league);
      else reject(new Error(ev.data.error || "Worker parse failed"));
      worker.terminate();
    };
    worker.onerror = (e) => { reject(new Error(e.message || "Worker error")); worker.terminate(); };
    worker.postMessage({ kind: "file", file, hinted: hinted ?? null });
  });
}