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

// Normalize common share page links to direct download links
function normalizeRemoteUrl(raw: string): string {
  let url = raw.trim();
  
  try {
    const urlObj = new URL(url);
    
    // 1) Dropbox - convert all variants to dl.dropboxusercontent.com
    if (['www.dropbox.com', 'dropbox.com', 'dl.dropbox.com'].includes(urlObj.hostname)) {
      // Extract path and query
      let path = urlObj.pathname;
      let searchParams = new URLSearchParams(urlObj.search);
      
      // Convert to dropboxusercontent.com domain
      urlObj.hostname = 'dl.dropboxusercontent.com';
      
      // Ensure dl=1 and remove st parameter
      searchParams.set('dl', '1');
      searchParams.delete('st');
      
      urlObj.search = searchParams.toString();
      url = urlObj.toString();
    }
    
    // 2) GitHub - convert blob to raw
    else if (urlObj.hostname === 'github.com' && urlObj.pathname.includes('/blob/')) {
      // Convert /blob/ to raw.githubusercontent.com
      const pathParts = urlObj.pathname.split('/');
      if (pathParts.length >= 5) {
        const [, user, repo, , branch, ...filePath] = pathParts;
        url = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath.join('/')}`;
      }
    }
    
    // GitHub Gist - convert page to raw
    else if (urlObj.hostname === 'gist.github.com') {
      const pathParts = urlObj.pathname.split('/');
      if (pathParts.length >= 3) {
        const [, user, id] = pathParts;
        url = `https://gist.githubusercontent.com/${user}/${id}/raw`;
      }
    }
    
    // 3) Google Drive - convert view/open to direct download
    else if (urlObj.hostname === 'drive.google.com') {
      let fileId = '';
      
      // Extract file ID from different URL formats
      if (urlObj.pathname.includes('/file/d/')) {
        const match = urlObj.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match) fileId = match[1];
      } else if (urlObj.pathname === '/open') {
        fileId = urlObj.searchParams.get('id') || '';
      }
      
      if (fileId) {
        url = `https://drive.google.com/uc?export=download&id=${fileId}`;
      }
    }
    
    // 4) OneDrive/SharePoint - ensure download=1
    else if (urlObj.hostname.includes('sharepoint.com') || urlObj.hostname.includes('1drv.ms')) {
      const searchParams = new URLSearchParams(urlObj.search);
      searchParams.set('download', '1');
      urlObj.search = searchParams.toString();
      url = urlObj.toString();
    }
    
    return url;
  } catch (error) {
    // If URL parsing fails, return original
    return raw;
  }
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
  
  // Normalize URL (convert share pages to direct download links)
  const normalizedUrl = normalizeRemoteUrl(url);
  
  // Validate URL security after normalization
  if (!isValidUrl(normalizedUrl)) {
    return res.status(400).json({ message: 'That URL can\'t be fetched from the server. Please use a public HTTPS link or use File Upload.' });
  }
  
  try {
    // Fetch the remote resource
    const response = await fetchWithTimeout(normalizedUrl, TIMEOUT_MS);
    
    if (!response.ok) {
      return res.status(400).json({ 
        message: `We couldn't download that URL (${response.status} ${response.statusText}). Check the link is public and try again.` 
      });
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