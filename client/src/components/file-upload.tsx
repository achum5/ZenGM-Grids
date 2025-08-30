import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloudUpload, FileCheck, X, Play, Loader2, Link } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { FileUploadData, Game, TeamInfo } from "@shared/schema";
import { processLeagueDataClientSide, type BBGMLeagueData } from "@/lib/clientLeagueProcessor";
import { decodeLeagueFile, decodeLeagueBytes, isGzipMagic } from "@/lib/leagueDecode";
import { buildGridFromFileUploadData } from "@shared/grid";

interface FileUploadProps {
  onGameGenerated: (game: Game) => void;
  onTeamDataUpdate?: (teamData: TeamInfo[]) => void;
  onUploadDataUpdate?: (data: FileUploadData | null) => void;
}

export function FileUpload({ onGameGenerated, onTeamDataUpdate, onUploadDataUpdate }: FileUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState<FileUploadData | null>(null);
  type UploadMode = "json-client" | "url";
  const [mode, setMode] = useState<UploadMode>("json-client");
  const [urlInput, setUrlInput] = useState('');
  const { toast } = useToast();

  // Force local by default
  useEffect(() => { setMode("json-client"); }, []);

  // Network guard to prevent any network calls during local processing
  function installNoNetworkGuard() {
    const origFetch = globalThis.fetch;
    const origOpen = XMLHttpRequest.prototype.open;
    (globalThis as any).fetch = (...args: any[]) => {
      console.error("Blocked network call during json-client upload:", args[0]);
      throw new Error("No network allowed in json-client upload path.");
    };
    XMLHttpRequest.prototype.open = function () {
      throw new Error("No XHR allowed in json-client upload path.");
    };
    return () => { 
      (globalThis as any).fetch = origFetch; 
      XMLHttpRequest.prototype.open = origOpen; 
    };
  }

  // Safe fetch helper for URL/server paths only (never used by JSON client path)
  async function safeFetchBytes(url: string): Promise<{u8: Uint8Array, enc: string}> {
    const res = await fetch(url, { redirect: "follow" });
    const ab = await res.arrayBuffer();
    const u8 = new Uint8Array(ab);
    if (!res.ok) {
      const snippet = new TextDecoder().decode(u8).slice(0, 200);
      throw new Error(`HTTP ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ""}`);
    }
    const enc = (res.headers.get("x-content-encoding") || "").toLowerCase();
    return { u8, enc };
  }

  function normalizeLeagueUrl(u: string): string {
    try {
      const url = new URL(u);
      if (url.hostname.includes("dropbox") && !url.hostname.includes("dropboxusercontent.com")) {
        url.hostname = "dl.dropboxusercontent.com";
        url.searchParams.set("dl", "1");
        ["st", "rlkey"].forEach(q => url.searchParams.delete(q));
        return url.toString();
      }
      if (url.hostname === "github.com" && url.pathname.includes("/blob/")) {
        url.hostname = "raw.githubusercontent.com";
        url.pathname = url.pathname.replace("/blob/", "/");
        return url.toString();
      }
      return u;
    } catch { return u; }
  }


  // Local JSON/GZIP handler (zero network)
  async function handleJsonClientFile(file: File) {
    const restore = installNoNetworkGuard();
    try {
      setUploadedFile(file);
      // Accept .json and .json.gz/.gz
      const raw = await decodeLeagueFile(file);
      const processed = await processLeagueDataClientSide(raw);
      
      // Continue existing flow
      setUploadData(processed);
      onUploadDataUpdate?.(processed);
      onTeamDataUpdate?.(processed.teams);
      
      // Generate grid immediately from the processed data
      try {
        const grid = buildGridFromFileUploadData(processed);
        onGameGenerated(grid);
        toast({
          title: "League loaded successfully",
          description: `Loaded ${processed.players.length} players from ${processed.teams.length} teams with ${processed.achievements.length} achievements. Grid generated!`,
        });
      } catch (gridError: any) {
        console.error("Grid generation error:", gridError);
        toast({
          title: "League loaded but grid generation failed",
          description: gridError.message || "Could not generate a valid grid from this data",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "League loading failed",
        description: err?.message ?? "Failed to read or parse league file.",
        variant: "destructive",
      });
      setUploadedFile(null);
    } finally {
      restore();
    }
  }

  // URL handler (allowed to network; fetches bytes via proxy and decodes exactly like local)
  async function handleUrlUpload(inputUrl: string) {
    try {
      const normalized = normalizeLeagueUrl(inputUrl.trim());
      const { u8, enc } = await safeFetchBytes(`/api/fetch-league?url=${encodeURIComponent(normalized)}`);
      const raw = decodeLeagueBytes(u8); // checks magic internally
      const processed = await processLeagueDataClientSide(raw);
      
      setUploadData(processed);
      onUploadDataUpdate?.(processed);
      onTeamDataUpdate?.(processed.teams);
      
      // Generate grid immediately from the processed data
      try {
        const grid = buildGridFromFileUploadData(processed);
        onGameGenerated(grid);
        toast({
          title: "URL loaded successfully",
          description: `Loaded ${processed.players.length} players from ${processed.teams.length} teams. Grid generated!`,
        });
      } catch (gridError: any) {
        console.error("Grid generation error:", gridError);
        toast({
          title: "URL loaded but grid generation failed",
          description: gridError.message || "Could not generate a valid grid from this data",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "URL loading failed",
        description: err?.message ?? "Failed to load or parse league file from URL.",
        variant: "destructive",
      });
    }
  }

  // Generate grid from current data
  const generateGrid = () => {
    if (!uploadData) {
      toast({
        title: "No data available",
        description: "Please upload a league file first.",
        variant: "destructive",
      });
      return;
    }

    try {
      const grid = buildGridFromFileUploadData(uploadData);
      onGameGenerated(grid);
      toast({
        title: "New grid generated",
        description: "Ready to play!",
        duration: 1000,
      });
    } catch (error: any) {
      toast({
        title: "Failed to generate grid",
        description: error.message || "Could not generate a valid grid from this data",
        variant: "destructive",
      });
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      handleJsonClientFile(file);
    }
  }, []);

  const handleUrlUploadClick = () => {
    if (!urlInput.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }
    
    handleUrlUpload(urlInput);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'application/json': ['.json'], 
      'application/gzip': ['.gz'], 
      'application/x-gzip': ['.json.gz'] 
    },
    multiple: false,
  });

  const removeFile = () => {
    setUploadedFile(null);
    setUploadData(null);
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload League Data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={mode} onValueChange={(value) => setMode(value as UploadMode)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="json-client">File Upload</TabsTrigger>
            <TabsTrigger value="url">URL Upload</TabsTrigger>
          </TabsList>
          
          <TabsContent value="json-client" className="space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                isDragActive
                  ? "border-basketball bg-orange-50 dark:bg-orange-900/20"
                  : "border-gray-300 dark:border-gray-600 hover:border-basketball hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
              data-testid="upload-dropzone"
            >
              <input {...getInputProps()} data-testid="input-file" />
              <CloudUpload className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-300 mb-2">
                {isDragActive ? "Drop the file here" : "Drag & drop your league file here"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Supports .json and .json.gz/.gz files processed locally in browser</p>
              <Button
                type="button"
                className="bg-basketball text-white hover:bg-orange-600 border-basketball"
                disabled={false}
                data-testid="button-browse-files"
              >
                "Browse Files"
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
                    if (e.key === 'Enter' && urlInput.trim()) {
                      handleUrlUploadClick();
                    }
                  }}
                  className="flex-1 url-upload-input"
                  disabled={false}
                />
                <Button
                  onClick={handleUrlUploadClick}
                  className="bg-basketball text-white hover:bg-orange-600"
                  disabled={!urlInput.trim()}
                  data-testid="button-upload-url"
                >
                  <>
                    <Link className="mr-2 h-4 w-4" />
                    Load URL
                  </>
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

        {uploadData && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
              <p data-testid="text-players-count">Players: {uploadData.players.length}</p>
              <p data-testid="text-teams-count">Teams: {uploadData.teams.length}</p>
              <p data-testid="text-achievements-count">Achievements: {uploadData.achievements.length}</p>
            </div>
            
            <div className="text-center">
              <Button 
                onClick={generateGrid}
                disabled={false}
                className="bg-basketball text-white hover:bg-orange-600 text-lg px-8 py-3 h-auto font-semibold"
                data-testid="button-generate-grid"
              >
                <Play className="mr-2 h-5 w-5" />
                Generate New Grid
              </Button>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
