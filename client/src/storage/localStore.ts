import { set as idbSet, get as idbGet, del as idbDel } from "idb-keyval";
import { ungzip } from "pako";

export type GridGuess = { cell: string; pid: number; correct: boolean; rarity?: number };

export type GridState = {
  id: string;
  createdAt: number;
  leagueId: string;  // FK to LeagueMeta.id
  gridSpec: any;     // your 3×3 criteria object
  guesses: GridGuess[];
  stats: {
    correct: number;
    incorrect: number;
    guessesLeft: number;
    rarityTotal: number;
    rarityAvg: number;
    rarityBest: number;
    rarityWorst: number;
  };
  version: number;   // start at 1
};

export type LeagueMeta = {
  id: string;
  name: string;
  size: number;
  type: "json" | "gz";
  savedAt: number;
  hash: string;      // simple content hash for dedupe
  version: number;   // start at 1
};

const LS = {
  lastLeagueId: "zgm:lastLeagueId",
  lastGridId: "zgm:lastGridId",
  hasResume: "zgm:hasResume",
} as const;

/** Save a league Blob (file OR fetched from URL) into IDB and pointers in localStorage. */
export async function saveLeagueBlob(blob: Blob, name: string, type: "json" | "gz"): Promise<LeagueMeta> {
  const id = crypto.randomUUID();
  const meta: LeagueMeta = {
    id,
    name,
    size: blob.size,
    type,
    savedAt: Date.now(),
    hash: await quickHash(blob),
    version: 1,
  };
  await idbSet(`zgm:league:${id}:blob`, blob);
  await idbSet(`zgm:league:${id}:meta`, meta);
  localStorage.setItem(LS.lastLeagueId, id);
  localStorage.setItem(LS.hasResume, "1");
  return meta;
}

/** Load the saved league Blob+meta from IDB by id. */
export async function loadLeagueBlob(id: string): Promise<{ blob: Blob; meta: LeagueMeta } | null> {
  const [blob, meta] = await Promise.all([
    idbGet(`zgm:league:${id}:blob`),
    idbGet(`zgm:league:${id}:meta`),
  ]);
  if (!blob || !meta) return null;
  return { blob: blob as Blob, meta: meta as LeagueMeta };
}

/** Delete the saved league by id. */
export async function deleteLeague(id: string) {
  await idbDel(`zgm:league:${id}:blob`);
  await idbDel(`zgm:league:${id}:meta`);
  if (localStorage.getItem(LS.lastLeagueId) === id) {
    localStorage.removeItem(LS.lastLeagueId);
  }
}

/** Save grid state to IDB and pointers in localStorage. */
export async function saveGridState(state: GridState) {
  await idbSet(`zgm:grid:${state.id}`, state);
  localStorage.setItem(LS.lastGridId, state.id);
  localStorage.setItem(LS.hasResume, "1");
}

/** Load grid state from IDB by id. */
export async function loadGridState(id: string): Promise<GridState | null> {
  return ((await idbGet(`zgm:grid:${id}`)) as GridState) ?? null;
}

export async function deleteGridState(id: string) {
  await idbDel(`zgm:grid:${id}`);
  if (localStorage.getItem(LS.lastGridId) === id) {
    localStorage.removeItem(LS.lastGridId);
  }
}

export function getLastLeagueId() { return localStorage.getItem(LS.lastLeagueId); }
export function getLastGridId()   { return localStorage.getItem(LS.lastGridId); }
export function hasResumeData()   { return localStorage.getItem(LS.hasResume) === "1"; }

/** Parse a saved Blob back into JSON (supports gz and json). */
export async function parseLeagueBlobToJson(blob: Blob, type: "json" | "gz"): Promise<any> {
  if (type === "json") {
    const text = await blob.text();
    return JSON.parse(text);
  } else {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const unz = ungzip(buf, { to: "string" }) as string;
    return JSON.parse(unz);
  }
}

/** Quick content hash (FNV-1a) to detect same upload */
async function quickHash(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let h = 2166136261 >>> 0;
  const v = new Uint8Array(buf);
  for (let i = 0; i < v.length; i++) { h ^= v[i]; h = (h * 16777619) >>> 0; }
  return ("00000000" + h.toString(16)).slice(-8);
}

/** Small helper to debounce any async saver. */
export function debounce<T extends (...args: any[]) => any>(fn: T, ms = 300) {
  let t: number | undefined;
  const wrapper = (...args: Parameters<T>) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
  (wrapper as any).flush = () => {
    if (t) { window.clearTimeout(t); t = undefined; }
    fn();
  };
  return wrapper as T & { flush?: () => void };
}