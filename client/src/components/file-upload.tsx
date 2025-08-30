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

interface FileUploadProps {
  onGameGenerated: (game: Game) => void;
  onTeamDataUpdate?: (teamData: TeamInfo[]) => void;
}

type UploadMode = "json-client" | "json-gzip" | "url";

export function FileUpload({ onGameGenerated, onTeamDataUpdate }: FileUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState<FileUploadData | null>(null);
  const [mode, setMode] = useState<UploadMode>("json-client");
  const [urlInput, setUrlInput] = useState('');
  const { toast } = useToast();

  // Force JSON client mode to avoid SSR/hydration mismatches
  useEffect(() => { 
    setMode("json-client"); 
  }, []);

  // Flag to enable only JSON client mode for now
  const JSON_ONLY = true;

  // Hard no-network guard for JSON client processing
  const installNoNetworkGuard = () => {
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
  };

  // JSON client file handler - zero network calls
  const handleJsonClientFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".json")) {
      toast({
        title: "Invalid file type",
        description: "This uploader only accepts plain .json files.",
        variant: "destructive",
      });
      return;
    }
    
    const restore = installNoNetworkGuard();
    try {
      setUploadedFile(file);
      const text = await file.text();      // browser only
      const raw = JSON.parse(text) as BBGMLeagueData;        // easy way
      const processed = await processLeagueDataClientSide(raw); // client processor
      
      // Continue existing success path
      setUploadData(processed);
      onTeamDataUpdate?.(processed.teams);
      toast({
        title: "League loaded successfully",
        description: `Loaded ${processed.players.length} players from ${processed.teams.length} teams`,
      });
      
      // Automatically generate a new grid after successful client-side processing
      generateGameMutation.mutate();
    } catch (err: any) {
      toast({
        title: "JSON loading failed",
        description: err?.message ?? "Failed to read or parse JSON.",
        variant: "destructive",
      });
      setUploadedFile(null);
    } finally {
      restore();
    }
  };

  // Safe fetch helper for URL/server paths only (never used by JSON client path)
  const safeFetchJson = async (input: RequestInfo, init?: RequestInit) => {
    const res = await fetch(input, init);
    const ctype = res.headers.get("content-type") || "";
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0,150)}` : ""}`);
    }
    if (!ctype.includes("application/json")) {
      throw new Error(`Expected JSON but got "${ctype}". First chars: ${text.slice(0,60)}`);
    }
    return JSON.parse(text);
  };


  const uploadMutation = useMutation({
    mutationFn: async (fileOrUrl: File | string) => {
      if (typeof fileOrUrl === 'string') {
        // URL upload
        return await safeFetchJson("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: fileOrUrl }),
        }) as FileUploadData;
      } else {
        // File upload (only for non-JSON files, JSON files are handled client-side)
        const formData = new FormData();
        formData.append("file", fileOrUrl);
        return await safeFetchJson("/api/upload", {
          method: "POST",
          body: formData,
        }) as FileUploadData;
      }
    },
    onSuccess: (data) => {
      setUploadData(data);
      onTeamDataUpdate?.(data.teams);
      toast({
        title: mode === 'url' ? "URL loaded successfully" : "File uploaded successfully",
        description: `Loaded ${data.players.length} players from ${data.teams.length} teams`,
      });
      // Automatically generate a new grid after successful upload
      generateGameMutation.mutate();
    },
    onError: (error) => {
      toast({
        title: mode === 'url' ? "URL loading failed" : "Upload failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadedFile(null);
    },
  });

  const generateGameMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/games/generate");
      return response.json() as Promise<Game>;
    },
    onSuccess: (game) => {
      onGameGenerated(game);
      toast({
        title: "New grid generated",
        description: "Ready to play!",
        duration: 1000,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to generate grid",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      if (mode === "json-client") {
        handleJsonClientFile(file);
      } else {
        // For other modes, use server upload
        setUploadedFile(file);
        uploadMutation.mutate(file);
      }
    }
  }, [mode, handleJsonClientFile, uploadMutation]);

  const handleUrlUpload = () => {
    if (!urlInput.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }
    
    // Auto-convert Dropbox www URLs to dl URLs
    let processedUrl = urlInput.trim();
    if (processedUrl.includes("www.dropbox.com")) {
      processedUrl = processedUrl.replace("www.dropbox.com", "dl.dropbox.com");
      // Also ensure the dl=0 parameter is set to dl=1 for direct download
      if (processedUrl.includes("dl=0")) {
        processedUrl = processedUrl.replace("dl=0", "dl=1");
      } else if (!processedUrl.includes("dl=1")) {
        processedUrl += processedUrl.includes("?") ? "&dl=1" : "?dl=1";
      }
    }
    
    setUploadedFile(null);
    uploadMutation.mutate(processedUrl);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // Accept any file - let backend validate content
    multiple: false,
  });

  const removeFile = () => {
    setUploadedFile(null);
    setUploadData(null);
  };

  const generateGrid = () => {
    generateGameMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload League Data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {JSON_ONLY ? (
          <div className="space-y-4">
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
                {isDragActive ? "Drop the JSON file here" : "Drag & drop your JSON league file here"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">JSON files processed locally in browser - zero network calls</p>
              <Button
                type="button"
                className="bg-basketball text-white hover:bg-orange-600 border-basketball"
                disabled={uploadMutation.isPending}
                data-testid="button-browse-files"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Browse JSON Files"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Tabs value={mode} onValueChange={(value) => setMode(value as UploadMode)} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="json-gzip">File Upload</TabsTrigger>
              <TabsTrigger value="url">URL Upload</TabsTrigger>
            </TabsList>
            
            <TabsContent value="json-gzip" className="space-y-4">
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
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Supports gzipped league files</p>
                <Button
                  type="button"
                  className="bg-basketball text-white hover:bg-orange-600 border-basketball"
                  disabled={uploadMutation.isPending}
                  data-testid="button-browse-files"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
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
                      if (e.key === 'Enter' && urlInput.trim() && !uploadMutation.isPending) {
                        handleUrlUpload();
                      }
                    }}
                    className="flex-1 url-upload-input"
                    disabled={uploadMutation.isPending}
                  />
                  <Button
                    onClick={handleUrlUpload}
                    className="bg-basketball text-white hover:bg-orange-600"
                    disabled={uploadMutation.isPending || !urlInput.trim()}
                    data-testid="button-upload-url"
                  >
                    {uploadMutation.isPending ? (
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
        )}

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
                disabled={generateGameMutation.isPending}
                className="bg-basketball text-white hover:bg-orange-600 text-lg px-8 py-3 h-auto font-semibold"
                data-testid="button-generate-grid"
              >
                {generateGameMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    Generate New Grid
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
