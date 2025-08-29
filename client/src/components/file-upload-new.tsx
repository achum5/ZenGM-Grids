import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloudUpload, FileCheck, X, Play, Loader2, Link } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { gunzipSync, strFromU8 } from "fflate";
import { z } from "zod";
import type { FileUploadData, Game, TeamInfo } from "@shared/schema";

// Discriminated union for file vs URL validation
const FileMode = z.object({
  mode: z.literal("file"),
  file: z.custom<File>((v) => v instanceof File && v.size > 0, "Choose a league file"),
});

const UrlMode = z.object({
  mode: z.literal("url"),
  url: z.string().url("Enter a valid http(s) URL"),
});

const UploadSchema = z.discriminatedUnion("mode", [FileMode, UrlMode]);
type UploadInput = z.infer<typeof UploadSchema>;

interface FileUploadProps {
  onGameGenerated: (game: Game) => void;
  onTeamDataUpdate?: (teamData: TeamInfo[]) => void;
}

// Client-side parsing function for league data
async function parseLeagueBytes(arr: Uint8Array): Promise<any> {
  const isGzip = arr[0] === 0x1f && arr[1] === 0x8b;
  const txt = isGzip ? strFromU8(gunzipSync(arr)) : new TextDecoder().decode(arr);
  if (!txt.trim().startsWith("{") && !txt.trim().startsWith("[")) {
    throw new Error("Not a valid league export (.json or .json.gz).");
  }
  return JSON.parse(txt);
}

export function FileUpload({ onGameGenerated, onTeamDataUpdate }: FileUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState<FileUploadData | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [urlInput, setUrlInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Process league data client-side and send to server
  const processLeague = useMutation({
    mutationFn: async (leagueData: any) => {
      // For now, use existing endpoint - can be switched to /api/process-league later
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leagueData),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Processing failed");
      }
      
      return response.json() as Promise<FileUploadData>;
    },
    onSuccess: (data) => {
      setUploadData(data);
      onTeamDataUpdate?.(data.teams);
      toast({
        title: uploadMode === 'url' ? "URL loaded successfully" : "File uploaded successfully",
        description: `Loaded ${data.players.length} players from ${data.teams.length} teams`,
      });
      setIsProcessing(false);
      // Automatically generate a new grid after successful upload
      generateGameMutation.mutate();
    },
    onError: (error) => {
      toast({
        title: uploadMode === 'url' ? "URL loading failed" : "Upload failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadedFile(null);
      setIsProcessing(false);
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

  // Handle file upload with client-side parsing
  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    try {
      const arr = new Uint8Array(await file.arrayBuffer());
      const leagueData = await parseLeagueBytes(arr);
      processLeague.mutate(leagueData);
    } catch (error: any) {
      toast({
        title: "File parsing failed",
        description: error?.message ?? "Failed to read file.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setUploadedFile(file);
      handleFileUpload(file);
    }
  }, []);

  // Handle URL upload with client-side parsing
  const handleUrlUpload = async () => {
    const candidate = { mode: "url" as const, url: urlInput.trim() };
    const parsed = UploadSchema.safeParse(candidate);
    if (!parsed.success) {
      toast({
        title: "Invalid URL",
        description: parsed.error.issues[0]?.message ?? "Invalid URL",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setUploadedFile(null);
    
    try {
      // Auto-convert Dropbox www URLs to dl URLs
      let processedUrl = parsed.data.mode === "url" ? parsed.data.url : "";
      if (processedUrl.includes("www.dropbox.com")) {
        processedUrl = processedUrl.replace("www.dropbox.com", "dl.dropbox.com");
        if (processedUrl.includes("dl=0")) {
          processedUrl = processedUrl.replace("dl=0", "dl=1");
        } else if (!processedUrl.includes("dl=1")) {
          processedUrl += processedUrl.includes("?") ? "&dl=1" : "?dl=1";
        }
      }
      
      // Try direct fetch first - if CORS blocks, the existing /api/upload-url endpoint handles it
      try {
        const response = await fetch(processedUrl);
        if (response.ok) {
          const arr = new Uint8Array(await response.arrayBuffer());
          const leagueData = await parseLeagueBytes(arr);
          processLeague.mutate(leagueData);
          return;
        }
      } catch (corsError) {
        // CORS blocked - fall back to server proxy (existing endpoint)
        console.log("Direct fetch blocked by CORS, using server proxy");
      }
      
      // Use existing server endpoint as fallback
      const response = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: processedUrl }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "URL loading failed");
      }
      
      const data = await response.json();
      setUploadData(data);
      onTeamDataUpdate?.(data.teams);
      toast({
        title: "URL loaded successfully",
        description: `Loaded ${data.players.length} players from ${data.teams.length} teams`,
      });
      setIsProcessing(false);
      generateGameMutation.mutate();
      
    } catch (error: any) {
      toast({
        title: "URL loading failed",
        description: error?.message ?? "Could not fetch that URL.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
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
        <Tabs value={uploadMode} onValueChange={(value) => setUploadMode(value as 'file' | 'url')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file">File Upload</TabsTrigger>
            <TabsTrigger value="url">URL Upload</TabsTrigger>
          </TabsList>
          
          <TabsContent value="file" className="space-y-4">
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
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Supports JSON and gzipped league files</p>
              <Button
                type="button"
                className="bg-basketball text-white hover:bg-orange-600 border-basketball"
                disabled={isProcessing || processLeague.isPending}
                data-testid="button-browse-files"
              >
                {isProcessing || processLeague.isPending ? (
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
                    if (e.key === 'Enter' && urlInput.trim() && !isProcessing && !processLeague.isPending) {
                      handleUrlUpload();
                    }
                  }}
                  className="flex-1 url-upload-input"
                  disabled={isProcessing || processLeague.isPending}
                />
                <Button
                  onClick={handleUrlUpload}
                  className="bg-basketball text-white hover:bg-orange-600"
                  disabled={isProcessing || processLeague.isPending || !urlInput.trim()}
                  data-testid="button-upload-url"
                >
                  {isProcessing || processLeague.isPending ? (
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