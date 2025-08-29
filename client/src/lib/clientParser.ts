import { gunzipSync, strFromU8 } from "fflate";

export async function parseBytes(arr: Uint8Array) {
  // Detect gzip by magic bytes
  const isGz = arr[0] === 0x1f && arr[1] === 0x8b;
  
  let txt: string;
  if (isGz) {
    try {
      const decompressed = gunzipSync(arr);
      txt = strFromU8(decompressed);
    } catch (error) {
      throw new Error("Failed to decompress gzip file");
    }
  } else {
    txt = new TextDecoder().decode(arr);
  }
  
  const trimmed = txt.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    throw new Error("Not a valid league export (.json or .json.gz).");
  }
  
  try {
    return JSON.parse(txt);
  } catch (error) {
    throw new Error("Not a valid league export (.json or .json.gz).");
  }
}

export async function parseFile(file: File): Promise<any> {
  // Optional size guard for "easy way" (tune as needed)
  const MAX_BYTES = 75 * 1024 * 1024; // 75MB
  if (file.size > MAX_BYTES) {
    throw new Error("This league is very large. Try trimming seasons or use the advanced uploader later.");
  }
  
  const arr = new Uint8Array(await file.arrayBuffer());
  return parseBytes(arr);
}

export async function parseUrl(url: string): Promise<any> {
  let res: Response;
  
  try {
    // Try direct fetch first
    res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error("Direct fetch failed");
    }
  } catch (error) {
    // If CORS/other blocks, fallback to proxy
    try {
      res = await fetch(`/api/download?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        throw new Error(`Download failed: ${res.status} ${res.statusText}`);
      }
    } catch (proxyError) {
      throw new Error("Could not fetch that URL.");
    }
  }
  
  const arr = new Uint8Array(await res.arrayBuffer());
  return parseBytes(arr);
}