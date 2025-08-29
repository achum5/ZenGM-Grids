import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloudUpload, FileCheck, X, Loader2, Link } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { fetchLeagueBytes, fileToBytes, parseLeagueInWorker, parseLeagueSync } from "@/lib/leagueIO";
import { toGridDataset } from "@/lib/processLeague";
import { buildGrid } from "@/lib/grid";
import { setSessionJSON } from "@/lib/session";
import type { Game, TeamInfo } from "@shared/schema";

interface FileUploadProps {
  onGameGenerated: (game: Game) => void;
  onTeamDataUpdate?: (teamData: TeamInfo[]) => void;
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
      // Worker for big files; fallback to sync for tiny ones if you want
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

      setLocation("/play"); // Navigate to play screen
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
      const league = await parseLeagueInWorker(bytes, hinted); // worker parse
      const ds = toGridDataset(league);
      const grid = buildGrid(ds);
      
      // Save to session for the play screen
      setSessionJSON("grid-dataset", ds);
      setSessionJSON("grid", grid);

      toast({
        title: "File uploaded successfully",
        description: `Loaded ${ds.players.length} players from ${ds.teams.length} teams`,
      });
      
      setLocation("/play"); // Navigate to play screen
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
                disabled={loading}
                data-testid="button-browse-files"
              >
                {loading ? (
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
