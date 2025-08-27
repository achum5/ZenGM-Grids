import * as pako from 'pako';

export interface ImportSource {
  type: 'file' | 'url';
  file?: File;
  url?: string;
}

export interface ImportResult {
  data: any;
  source: 'file' | 'url';
}

// Size limits
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Error messages as specified
export const ImportErrors = {
  NOT_JSON: "This file/link doesn't contain valid league JSON. Please upload a .json, .gz, or .json.gz BBGM export (any filename is fine).",
  WEB_PAGE: "That link looks like a web page, not the raw league file. Use a direct raw file link (e.g., GitHub Raw, Dropbox dl=1, S3 public object) or use File Upload.",
  TOO_LARGE: "That file is too large to process here. Please upload a smaller file or host it where it can be fetched directly.",
  NETWORK: "We couldn't download that URL. Check the link is public and try again.",
  SECURITY: "That URL can't be fetched from the server. Please use a public HTTPS link or use File Upload."
};

// Content detection utilities
function isGzipped(buffer: ArrayBuffer): boolean {
  const view = new Uint8Array(buffer);
  return view.length >= 2 && view[0] === 0x1f && view[1] === 0x8b;
}

function isHtmlContent(content: string): boolean {
  const lowerContent = content.toLowerCase().trim();
  return lowerContent.startsWith('<') || lowerContent.includes('<html');
}

// Decompression with fallback
async function decompressGzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  // Try native DecompressionStream first
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const stream = new DecompressionStream('gzip');
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(buffer));
          controller.close();
        }
      });
      
      const decompressed = readable.pipeThrough(stream);
      const response = new Response(decompressed);
      return await response.arrayBuffer();
    } catch (error) {
      // Fall back to pako
    }
  }
  
  // Fallback to pako
  try {
    const uint8Array = new Uint8Array(buffer);
    const decompressed = pako.ungzip(uint8Array);
    return decompressed.buffer.slice(decompressed.byteOffset, decompressed.byteOffset + decompressed.byteLength);
  } catch (error) {
    throw new Error("Failed to decompress gzip file");
  }
}

// Validate basic league structure
function validateLeagueData(data: any): void {
  if (!data || typeof data !== 'object') {
    throw new Error(ImportErrors.NOT_JSON);
  }
  
  // Check for expected top-level fields
  const hasPlayers = Array.isArray(data.players);
  const hasTeams = Array.isArray(data.teams);
  const isPlayerArray = Array.isArray(data);
  
  if (!hasPlayers && !hasTeams && !isPlayerArray) {
    throw new Error(ImportErrors.NOT_JSON);
  }
}

// Main import function
export async function loadLeague(source: ImportSource): Promise<any> {
  let buffer: ArrayBuffer;
  
  // Get raw bytes based on source type
  if (source.type === 'file' && source.file) {
    if (source.file.size > MAX_FILE_SIZE) {
      throw new Error(ImportErrors.TOO_LARGE);
    }
    buffer = await source.file.arrayBuffer();
  } else if (source.type === 'url' && source.url) {
    // For URL imports, we'll use the serverless function
    const response = await fetch(`/api/fetch-league?url=${encodeURIComponent(source.url)}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.message || ImportErrors.NETWORK);
      } catch {
        throw new Error(ImportErrors.NETWORK);
      }
    }
    
    buffer = await response.arrayBuffer();
  } else {
    throw new Error("Invalid import source");
  }
  
  // Check file size after fetching
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new Error(ImportErrors.TOO_LARGE);
  }
  
  // Detect and handle compression
  let finalBuffer = buffer;
  if (isGzipped(buffer)) {
    finalBuffer = await decompressGzip(buffer);
    
    // Check decompressed size
    if (finalBuffer.byteLength > MAX_FILE_SIZE) {
      throw new Error(ImportErrors.TOO_LARGE);
    }
  }
  
  // Convert to string
  const decoder = new TextDecoder('utf-8');
  const content = decoder.decode(finalBuffer);
  
  // Check for HTML content
  if (isHtmlContent(content)) {
    throw new Error(ImportErrors.WEB_PAGE);
  }
  
  // Parse JSON
  let data: any;
  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new Error(ImportErrors.NOT_JSON);
  }
  
  // Validate structure
  validateLeagueData(data);
  
  return data;
}