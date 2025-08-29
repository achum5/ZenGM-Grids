export function setSessionJSON(key: string, value: any) { 
  sessionStorage.setItem(key, JSON.stringify(value)); 
}

export function getSessionJSON<T = any>(key: string): T | null {
  const s = sessionStorage.getItem(key); 
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}