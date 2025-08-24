import { saveLeagueBlob, parseLeagueBlobToJson, LeagueMeta } from "./localStore";

/** Detect by filename or URL suffix. Defaults to 'json'. */
function detectTypeFromName(name: string): "json" | "gz" {
  const lower = name.toLowerCase();
  return lower.endsWith(".gz") ? "gz" : "json";
}

/** Handle a FILE upload -> Blob -> save -> parse */
export async function loadLeagueFromFile(file: File): Promise<{ meta: LeagueMeta; json: any }> {
  const name = file.name || "league.json";
  const type = detectTypeFromName(name);
  const meta = await saveLeagueBlob(file, name, type);
  const json = await parseLeagueBlobToJson(file, type);
  return { meta, json };
}

/** Handle a URL upload -> fetch -> Blob -> save -> parse */
export async function loadLeagueFromUrl(url: string): Promise<{ meta: LeagueMeta; json: any }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Failed to fetch league file from URL");
  const blob = await resp.blob();
  // Try to infer a name from the URL; fallback to 'league'
  const urlTail = url.split("?")[0].split("#")[0];
  const name = urlTail.split("/").pop() || "league";
  const type = detectTypeFromName(name);
  const meta = await saveLeagueBlob(blob, name, type);
  const json = await parseLeagueBlobToJson(blob, type);
  return { meta, json };
}