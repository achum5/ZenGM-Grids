import { ungzip } from "pako";

export function isGzipMagic(u8: Uint8Array) {
  return u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;
}

export function looksGzipByName(name: string) {
  const s = name.toLowerCase();
  return s.endsWith(".json.gz") || s.endsWith(".gz");
}

export function decodeLeagueBytes(u8: Uint8Array): any {
  const text = isGzipMagic(u8)
    ? new TextDecoder().decode(ungzip(u8))
    : new TextDecoder().decode(u8);
  return JSON.parse(text);
}

export async function decodeLeagueFile(file: File): Promise<any> {
  const u8 = new Uint8Array(await file.arrayBuffer());
  const needGunzip = isGzipMagic(u8) || looksGzipByName(file.name);
  const text = needGunzip
    ? new TextDecoder().decode(ungzip(u8))
    : await file.text();
  return JSON.parse(text);
}