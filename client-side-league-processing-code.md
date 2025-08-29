# Client-Side League Processing Code

This file contains all the code for the 100% client-side league processing functionality that eliminates server payload issues and works like BBGM.

## 1. League IO Library (`client/src/lib/leagueIO.ts`)

```typescript
import { gunzipSync } from "fflate";

// Normalize links to direct files
export function normalizeLeagueUrl(input: string): string {
  const u = new URL(input.trim());
  if (u.hostname === "www.dropbox.com" || u.hostname === "dropbox.com" || u.hostname === "dl.dropbox.com" || u.hostname.endsWith("dropbox.com")) {
    u.hostname = "dl.dropboxusercontent.com";
    u.searchParams.set("dl", "1");
  }
  if (u.hostname === "github.com") {
    const p = u.pathname.split("/").filter(Boolean);
    if (p.length >= 5 && p[2] === "blob") {
      const [user, repo, _blob, branch, ...rest] = p;
      u.hostname = "raw.githubusercontent.com";
      u.pathname = `/${user}/${repo}/${branch}/${rest.join("/")}`;
      u.search = "";
    }
  }
  if (u.hostname === "gist.github.com") {
    const p = u.pathname.split("/").filter(Boolean);
    if (p.length >= 2) {
      const [user, hash] = p;
      u.hostname = "gist.githubusercontent.com";
      u.pathname = `/${user}/${hash}/raw`;
      u.search = "";
    }
  }
  if (u.hostname === "drive.google.com" && u.pathname.startsWith("/file/")) {
    const id = u.pathname.split("/")[3];
    u.pathname = "/uc";
    u.search = "";
    u.searchParams.set("export", "download");
    u.searchParams.set("id", id);
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs are allowed.");
  return u.toString();
}

export async function fetchLeagueBytes(rawUrl: string) {
  const r = await fetch(`/api/fetch-league?url=${encodeURIComponent(rawUrl)}`);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`URL fetch failed (${r.status}): ${text || r.statusText}`);
  }
  const hinted = r.headers.get("x-content-encoding") as ("gzip" | null);
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { bytes, hinted };
}

export async function fileToBytes(file: File) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const hinted = file.name.toLowerCase().endsWith(".gz") ? ("gzip" as const) : null;
  return { bytes, hinted };
}

// Synchronous fallback (small files)
export function parseLeagueSync(bytes: Uint8Array, hinted?: "gzip" | null) {
  const needGunzip = hinted === "gzip" || (bytes[0] === 0x1f && bytes[1] === 0x8b);
  const raw = needGunzip ? gunzipSync(bytes) : bytes;
  const text = new TextDecoder().decode(raw);
  return JSON.parse(text);
}

// Worker-based parsing for large files
export async function parseLeagueInWorker(bytes: Uint8Array, hinted: "gzip" | null) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const worker = new Worker(new URL("../workers/leagueParse.worker.ts", import.meta.url), { type: "module" });
  return new Promise<any>((resolve, reject) => {
    const cleanup = () => worker.terminate();
    worker.onmessage = (e) => { 
      cleanup(); 
      const { ok, league, error } = e.data || {}; 
      ok ? resolve(league) : reject(new Error(error || "Parse failed")); 
    };
    worker.onerror = (ev) => { 
      cleanup(); 
      reject(new Error(ev.message || "Worker error")); 
    };
    worker.postMessage({ bytes: ab, hinted }, [ab as any]); // transfer
  });
}
```

## 2. Web Worker for League Parsing (`client/src/workers/leagueParse.worker.ts`)

```typescript
import { gunzip } from "fflate";

function isGzip(u8: Uint8Array) { return u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b; }
const gunzipAsync = (u8: Uint8Array) => new Promise<Uint8Array>((res, rej) => gunzip(u8, (e, out) => e ? rej(e) : res(out)));

self.onmessage = async (e: MessageEvent) => {
  try {
    const { bytes, hinted } = e.data as { bytes: ArrayBuffer; hinted?: "gzip" | null };
    let u8 = new Uint8Array(bytes); // transferred, zero-copy
    if (hinted === "gzip" || isGzip(u8)) u8 = await gunzipAsync(u8);
    const text = new TextDecoder().decode(u8);
    const league = JSON.parse(text);
    (self as any).postMessage({ ok: true, league });
  } catch (err: any) {
    (self as any).postMessage({ ok: false, error: String(err?.message || err) });
  }
};
```

## 3. League Processing (`client/src/lib/processLeague.ts`)

```typescript
// Extract only what grid generation needs.
export type GridTeam = { tid: number; name: string; abbrev?: string };
export type GridPlayer = { pid: number; name: string; teams: Array<{ tid: number; season?: number }> };

export function toGridDataset(league: any): { teams: GridTeam[]; players: GridPlayer[] } {
  const teams: GridTeam[] =
    league?.teams?.map((t: any) => ({ 
      tid: t.tid ?? t.teamId ?? t.id, 
      name: (t.region && t.name) ? `${t.region} ${t.name}` : (t.name || t.region || t.teamName), 
      abbrev: t.abbrev 
    })) ?? [];

  const players: GridPlayer[] =
    league?.players?.map((p: any) => ({
      pid: p.pid ?? p.playerId ?? p.id,
      name: p.name || [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown",
      teams: (p.stats || p.careerStats || p.teamHistory || []).map((s: any) => ({
        tid: s.tid ?? s.teamId ?? s.tidBefore ?? s.tidAfter ?? s.teamID,
        season: s.season ?? s.year,
      })).filter((x: any) => x && x.tid != null),
    })) ?? [];

  return { teams, players };
}
```

## 4. Grid Generation (`client/src/lib/grid.ts`)

```typescript
import type { GridTeam, GridPlayer } from "./processLeague";

export type Grid = {
  id: string;
  rows: GridCriteria[];
  cols: GridCriteria[];
  correctAnswers: string[][];
};

export type GridCriteria = {
  label: string;
  type: "team" | "achievement";
  value: string;
};

export function buildGrid(data: { teams: GridTeam[]; players: GridPlayer[] }): Grid {
  const { teams, players } = data;
  
  // Simple grid generation - pick teams for criteria
  const availableTeams = teams.filter(t => 
    players.filter(p => p.teams.some(pt => pt.tid === t.tid)).length >= 10
  );
  
  if (availableTeams.length < 6) {
    throw new Error("Not enough teams with sufficient players for grid generation");
  }
  
  // Create a 3x3 grid with teams as criteria
  const rowTeams = availableTeams.slice(0, 3);
  const colTeams = availableTeams.slice(3, 6);
  
  const rows: GridCriteria[] = rowTeams.map(team => ({
    label: team.name,
    type: "team" as const,
    value: team.name
  }));
  
  const cols: GridCriteria[] = colTeams.map(team => ({
    label: team.name,
    type: "team" as const,
    value: team.name
  }));
  
  // Build correct answers matrix
  const correctAnswers: string[][] = [];
  for (let row = 0; row < 3; row++) {
    correctAnswers[row] = [];
    for (let col = 0; col < 3; col++) {
      const rowTeamId = rowTeams[row].tid;
      const colTeamId = colTeams[col].tid;
      
      // Find players who played for both teams
      const matchingPlayers = players.filter(p => 
        p.teams.some(pt => pt.tid === rowTeamId) && 
        p.teams.some(pt => pt.tid === colTeamId)
      );
      
      // Sort by quality/importance if available, otherwise just use first few
      const topPlayers = matchingPlayers
        .slice(0, 10)
        .map(p => p.name);
      
      correctAnswers[row][col] = JSON.stringify(topPlayers);
    }
  }
  
  return {
    id: Date.now().toString(),
    rows,
    cols,
    correctAnswers
  };
}
```

## 5. Session Storage Helpers (`client/src/lib/session.ts`)

```typescript
export function setSessionJSON(key: string, value: any) { 
  sessionStorage.setItem(key, JSON.stringify(value)); 
}

export function getSessionJSON<T = any>(key: string): T | null {
  const s = sessionStorage.getItem(key); 
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}
```

## 6. Updated File Upload Component (`client/src/components/file-upload.tsx`)

```typescript
import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloudUpload, FileCheck, X, Loader2, Link } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { fetchLeagueBytes, fileToBytes, parseLeagueInWorker } from "@/lib/leagueIO";
import { toGridDataset } from "@/lib/processLeague";
import { buildGrid } from "@/lib/grid";
import { setSessionJSON } from "@/lib/session";

interface FileUploadProps {
  onGameGenerated?: (game: any) => void;
  onTeamDataUpdate?: (teamData: any[]) => void;
}

export function FileUpload({ onGameGenerated, onTeamDataUpdate }: FileUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  async function loadLeagueFromUrl(inputUrl: string) {
    setLoading(true);
    try {
      const { bytes, hinted } = await fetchLeagueBytes(inputUrl);
      const league = await parseLeagueInWorker(bytes, hinted);
      const ds = toGridDataset(league);
      const grid = buildGrid(ds);

      // Save to session for the play screen
      setSessionJSON("grid-dataset", ds);
      setSessionJSON("grid", grid);

      toast({
        title: "URL loaded successfully",
        description: `Loaded ${ds.players.length} players from ${ds.teams.length} teams`,
      });

      setLocation("/play");
    } catch (e: any) {
      toast({
        title: "URL loading failed",
        description: e.message || "Failed to load URL",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadLeagueFromFile(file: File) {
    setLoading(true);
    try {
      const { bytes, hinted } = await fileToBytes(file);
      const league = await parseLeagueInWorker(bytes, hinted);
      const ds = toGridDataset(league);
      const grid = buildGrid(ds);
      
      // Save to session for the play screen
      setSessionJSON("grid-dataset", ds);
      setSessionJSON("grid", grid);

      toast({
        title: "File uploaded successfully",
        description: `Loaded ${ds.players.length} players from ${ds.teams.length} teams`,
      });
      
      setLocation("/play");
    } catch (e: any) {
      toast({
        title: "Upload failed", 
        description: e.message || "Failed to load file",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setUploadedFile(file);
      loadLeagueFromFile(file);
    }
  }, []);

  const handleUrlUpload = () => {
    if (!urlInput.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }
    
    setUploadedFile(null);
    loadLeagueFromUrl(urlInput.trim());
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
      'application/gzip': ['.gz'],
      'application/x-gzip': ['.gz'],
      'text/plain': ['.gz'], // Some servers send .gz as text/plain
    },
    multiple: false,
  });

  const removeFile = () => {
    setUploadedFile(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload League Data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={uploadMode} onValueChange={(value) => setUploadMode(value as 'file' | 'url')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file">File Upload</TabsTrigger>
            <TabsTrigger value="url">URL Import</TabsTrigger>
          </TabsList>
          
          <TabsContent value="file" className="space-y-4">
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
                ${isDragActive 
                  ? 'border-basketball bg-orange-50 dark:bg-orange-900/10' 
                  : 'border-gray-300 dark:border-gray-600 hover:border-basketball hover:bg-gray-50 dark:hover:bg-gray-800'
                }
              `}
              data-testid="upload-dropzone"
            >
              <input {...getInputProps()} data-testid="input-file" />
              <CloudUpload className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-300 mb-2">
                {isDragActive ? "Drop the file here" : "Drag & drop your league file here"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Supports JSON and gzipped league files</p>
              <Button
                type="button"
                className="bg-basketball text-white hover:bg-orange-600 border-basketball"
                disabled={loading}
                data-testid="button-browse-files"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Browse Files"
                )}
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="url" className="space-y-4">
            <div className="space-y-4">
              <div className="text-center">
                <Link className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Enter League File URL
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Paste a direct link to a JSON or gzipped league file
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="Paste league file URL"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && urlInput.trim() && !loading) {
                      handleUrlUpload();
                    }
                  }}
                  className="flex-1 url-upload-input"
                  disabled={loading}
                />
                <Button
                  onClick={handleUrlUpload}
                  className="bg-basketball text-white hover:bg-orange-600"
                  disabled={loading || !urlInput.trim()}
                  data-testid="button-upload-url"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Link className="mr-2 h-4 w-4" />
                      Load URL
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {uploadedFile && (
          <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center space-x-2 min-w-0 flex-1">
              <FileCheck className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <span className="text-sm text-green-800 dark:text-green-300 truncate" data-testid="text-uploaded-filename" title={uploadedFile.name}>
                {uploadedFile.name}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={removeFile}
              className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
              data-testid="button-remove-file"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

## 7. Vercel Configuration (`vercel.json`)

```json
{
  "functions": {
    "api/**": {
      "maxDuration": 60
    }
  }
}
```

## 8. Server Functions (Keep these for URL fetching only)

### `/api/fetch-league.ts`
```typescript
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentEncoding = response.headers.get('content-encoding');
    const buffer = await response.arrayBuffer();
    
    res.setHeader('Content-Type', 'application/octet-stream');
    if (contentEncoding) {
      res.setHeader('x-content-encoding', contentEncoding);
    }
    
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch URL' });
  }
}
```

### `/api/ping.ts`
```typescript
export default function handler(req: any, res: any) {
  res.status(200).json({ message: 'pong', timestamp: new Date().toISOString() });
}
```

## Key Features

1. **100% Client-Side Processing**: All league parsing and grid generation happens in the browser
2. **Web Worker Support**: Large files are parsed in a background worker to avoid UI blocking
3. **Gzip Support**: Automatically handles compressed league files
4. **URL Fetching**: Server proxy for downloading remote files (bypasses CORS)
5. **Session Storage**: Data persists between upload and play screens
6. **Vercel Compatible**: No large payload issues, works on serverless platforms
7. **BBGM-Style**: Mimics Basketball GM's client-side architecture

This implementation eliminates all PayloadTooLargeError issues and provides a smooth, fast user experience for league file processing.