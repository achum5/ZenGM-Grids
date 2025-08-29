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
import type { FileUploadData, Game, TeamInfo } from "@shared/schema";
import { UploadSchema } from "@/lib/uploadValidation";
import { parseFile, parseUrl } from "@/lib/clientParser";
import { processLeagueData } from "@/lib/leagueProcessor";
import { useLeagueStore } from "@/stores/useLeagueStore";

interface FileUploadProps {
  onGameGenerated: (game: Game) => void;
  onTeamDataUpdate?: (teamData: TeamInfo[]) => void;
}

export function FileUpload({ onGameGenerated, onTeamDataUpdate }: FileUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  
  const { players, teams, achievements, isLoaded, setLeague } = useLeagueStore();

  const processMutation = useMutation({
    mutationFn: async (leagueData: any): Promise<FileUploadData> => {
      console.log("Processing league data client-side...");
      return await processLeagueData(leagueData);
    },
    onSuccess: (data) => {
      // Store in global state instead of local component state
      setLeague(null, data);
      onTeamDataUpdate?.(data.teams);
      toast({
        title: uploadMode === 'url' ? "URL loaded successfully" : "File uploaded successfully",
        description: `Loaded ${data.players.length} players from ${data.teams.length} teams`,
      });
      // Automatically generate a new grid after successful upload
      generateGameMutation.mutate();
    },
    onError: (error) => {
      toast({
        title: "Processing failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadedFile(null);
    },
  });

  const generateGameMutation = useMutation({
    mutationFn: async () => {
      // Check if we have data in the store
      const currentState = useLeagueStore.getState();
      if (!currentState.isLoaded || currentState.players.length === 0) {
        throw new Error("No players data available. Please upload a league file first.");
      }
      
      // Send players data to the server for grid generation
      const response = await apiRequest("POST", "/api/games/generate", {
        body: JSON.stringify({ 
          players: currentState.players,
          teams: currentState.teams,
          achievements: currentState.achievements
        }),
      });
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

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    setUploadedFile(file);
    
    try {
      const leagueData = await parseFile(file);
      processMutation.mutate(leagueData);
    } catch (e: any) {
      setError(e?.message ?? "Failed to read file.");
      setUploadedFile(null);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      handleFile(file);
    }
  }, []);

  const handleUrlUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const candidate = { mode: "url" as const, url: String(formData.get("url") || "") };
    
    const parsed = UploadSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid URL");
      return;
    }
    
    setError(null);
    setBusy(true);
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
      
      const leagueData = await parseUrl(processedUrl);
      processMutation.mutate(leagueData);
    } catch (e: any) {
      setError(e?.message ?? "Could not fetch that URL.");
    } finally {
      setBusy(false);
    }
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
    setError(null);
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
                disabled={busy || processMutation.isPending}
                data-testid="button-browse-files"
              >
                {busy || processMutation.isPending ? (
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
              <form onSubmit={handleUrlUpload} className="flex gap-2">
                <Input
                  name="url"
                  type="url"
                  placeholder="https://…/league.json or .json.gz"
                  required
                  className="flex-1 url-upload-input"
                  disabled={busy || processMutation.isPending}
                />
                <Button
                  type="submit"
                  className="bg-basketball text-white hover:bg-orange-600"
                  disabled={busy || processMutation.isPending}
                  data-testid="button-upload-url"
                >
                  {busy || processMutation.isPending ? (
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
              </form>
            </div>
          </TabsContent>
        </Tabs>

        {(busy || processMutation.isPending) && (
          <div className="flex items-center justify-center p-4 text-gray-600 dark:text-gray-300">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing league...
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-300">
            {error}
          </div>
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

        {isLoaded && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
              <p data-testid="text-players-count">Players: {players.length}</p>
              <p data-testid="text-teams-count">Teams: {teams.length}</p>
              <p data-testid="text-achievements-count">Achievements: {achievements.length}</p>
            </div>
            
            <div className="flex gap-4 justify-center">
              <Button 
                onClick={generateGrid}
                disabled={generateGameMutation.isPending || !isLoaded || players.length === 0}
                className="bg-basketball text-white hover:bg-orange-600 text-lg px-8 py-3 h-auto font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
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
              <Button 
                variant="outline"
                onClick={() => useLeagueStore.getState().clear()}
                className="text-gray-600 border-gray-300 hover:bg-gray-50"
                data-testid="button-clear-league"
              >
                <X className="mr-2 h-4 w-4" />
                Clear League
              </Button>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
