// Vercel serverless function types
interface VercelRequest {
  method?: string;
  query: { [key: string]: string | string[] | undefined };
  body?: any;
}

interface VercelResponse {
  status(code: number): VercelResponse;
  json(object: any): void;
  send(body: any): void;
  setHeader(name: string, value: string): void;
}

// Security constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10000; // 10 seconds
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
];

// Check for private IP ranges
function isPrivateIP(hostname: string): boolean {
  // IPv4 private ranges
  const ipv4Private = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
  ];
  
  // IPv6 private ranges (simplified)
  const ipv6Private = [
    /^::1$/,
    /^fc00:/,
    /^fd00:/,
    /^fe80:/,
  ];
  
  return ipv4Private.some(regex => regex.test(hostname)) ||
         ipv6Private.some(regex => regex.test(hostname)) ||
         BLOCKED_HOSTS.includes(hostname.toLowerCase());
}

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    
    // Must be HTTPS
    if (url.protocol !== 'https:') {
      return false;
    }
    
    // Check for blocked hosts
    if (isPrivateIP(url.hostname)) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, application/octet-stream, */*',
        'User-Agent': 'BBGM-Grid-Import/1.0',
      },
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  const { url } = req.query;
  
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ message: 'URL parameter is required' });
  }
  
  // Validate URL security
  if (!isValidUrl(url)) {
    return res.status(400).json({ message: 'That URL can\'t be fetched from the server. Please use a public HTTPS link or use File Upload.' });
  }
  
  try {
    // Fetch the remote resource
    const response = await fetchWithTimeout(url, TIMEOUT_MS);
    
    if (!response.ok) {
      return res.status(400).json({ message: 'We couldn\'t download that URL. Check the link is public and try again.' });
    }
    
    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return res.status(400).json({ message: 'That file is too large to process here. Please upload a smaller file or host it where it can be fetched directly.' });
    }
    
    // Read the response as array buffer with size checking
    const buffer = await response.arrayBuffer();
    
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return res.status(400).json({ message: 'That file is too large to process here. Please upload a smaller file or host it where it can be fetched directly.' });
    }
    
    // Set response headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Propagate gzip encoding if present
    const contentEncoding = response.headers.get('content-encoding');
    if (contentEncoding === 'gzip') {
      res.setHeader('X-Content-Encoding', 'gzip');
    }
    
    // Return raw bytes
    res.send(Buffer.from(buffer));
    
  } catch (error: any) {
    console.error('Fetch error:', error);
    
    if (error.name === 'AbortError') {
      return res.status(408).json({ message: 'Request timeout. The file took too long to download.' });
    }
    
    return res.status(500).json({ message: 'We couldn\'t download that URL. Check the link is public and try again.' });
  }
}