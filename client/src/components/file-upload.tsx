import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CloudUpload, FileCheck, X, Play } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { FileUploadData, Game } from "@shared/schema";

interface FileUploadProps {
  onGameGenerated: (game: Game) => void;
}

export function FileUpload({ onGameGenerated }: FileUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState<FileUploadData | null>(null);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }
      return response.json() as Promise<FileUploadData>;
    },
    onSuccess: (data) => {
      setUploadData(data);
      toast({
        title: "File uploaded successfully",
        description: `Loaded ${data.players.length} players from ${data.teams.length} teams`,
      });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
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
      setUploadedFile(file);
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/json": [".json"],
    },
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
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
            isDragActive
              ? "border-basketball bg-orange-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
          data-testid="upload-dropzone"
        >
          <input {...getInputProps()} data-testid="input-file" />
          <CloudUpload className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 mb-2">
            {isDragActive ? "Drop the file here" : "Drag & drop your league file here"}
          </p>
          <p className="text-sm text-gray-500 mb-4">Supports CSV and JSON formats</p>
          <Button
            type="button"
            variant="outline"
            className="bg-basketball text-white hover:bg-orange-600 border-basketball"
            disabled={uploadMutation.isPending}
            data-testid="button-browse-files"
          >
            {uploadMutation.isPending ? "Uploading..." : "Browse Files"}
          </Button>
        </div>

        {uploadedFile && (
          <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <FileCheck className="h-5 w-5 text-green-600" />
              <span className="text-sm text-green-800" data-testid="text-uploaded-filename">
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
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
            <p data-testid="text-players-count">Players: {uploadData.players.length}</p>
            <p data-testid="text-teams-count">Teams: {uploadData.teams.length}</p>
            <p data-testid="text-achievements-count">Achievements: {uploadData.achievements.length}</p>
          </div>
        )}

        <Button
          onClick={generateGrid}
          disabled={!uploadData || generateGameMutation.isPending}
          className="w-full bg-court text-white hover:bg-slate-700"
          data-testid="button-generate-grid"
        >
          <Play className="h-4 w-4 mr-2" />
          {generateGameMutation.isPending ? "Generating..." : "Generate New Grid"}
        </Button>
      </CardContent>
    </Card>
  );
}
