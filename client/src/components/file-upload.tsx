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
import { fetchLeagueBytes, fileToBytes, parseLeagueInWorker } from "@/lib/leagueIO";

interface FileUploadProps {
  onGameGenerated: (game: Game) => void;
  onTeamDataUpdate?: (teamData: TeamInfo[]) => void;
}

// Pure client-side league processing - NO server POST
function processLeagueClientSide(league: any): FileUploadData {
  console.log("Processing league client-side...", league);
  
  // Extract players from league
  const playersData = league.players || [];
  if (!Array.isArray(playersData)) {
    throw new Error("Invalid or missing players data in league file");
  }

  // Process players and extract data
  const players = playersData
    .map((playerData: any) => {
      try {
        // Convert BBGM player format to our format
        const teams = new Set<string>();
        const years: { team: string; start: number; end: number }[] = [];
        
        // Process player stats to extract teams and years
        if (Array.isArray(playerData.stats)) {
          playerData.stats.forEach((stat: any) => {
            if (stat.tid !== undefined && league.teams?.[stat.tid]) {
              const team = league.teams[stat.tid];
              const teamName = team.region ? `${team.region} ${team.name}` : team.name;
              teams.add(teamName);
              
              // Add year range
              const existingYear = years.find(y => y.team === teamName);
              if (existingYear) {
                existingYear.start = Math.min(existingYear.start, stat.season);
                existingYear.end = Math.max(existingYear.end, stat.season);
              } else {
                years.push({ team: teamName, start: stat.season, end: stat.season });
              }
            }
          });
        }

        // Calculate basic achievements and stats
        const achievements: string[] = [];
        let careerPoints = 0;
        let careerRebounds = 0;
        let careerAssists = 0;
        let careerSteals = 0;
        let careerBlocks = 0;
        let careerThrees = 0;

        if (Array.isArray(playerData.stats)) {
          playerData.stats.forEach((stat: any) => {
            if (!stat.playoffs) { // Regular season only
              careerPoints += stat.pts || 0;
              careerRebounds += (stat.orb || 0) + (stat.drb || 0);
              careerAssists += stat.ast || 0;
              careerSteals += stat.stl || 0;
              careerBlocks += stat.blk || 0;
              careerThrees += stat.tp || 0;
            }
          });
        }

        // Basic achievement calculations
        if (careerPoints >= 20000) achievements.push("20,000+ Career Points");
        if (careerRebounds >= 10000) achievements.push("10,000+ Career Rebounds");
        if (careerAssists >= 5000) achievements.push("5,000+ Career Assists");
        if (careerSteals >= 2000) achievements.push("2,000+ Career Steals");
        if (careerBlocks >= 1500) achievements.push("1,500+ Career Blocks");
        if (careerThrees >= 2000) achievements.push("2,000+ Made Threes");

        // Check for season averages
        if (Array.isArray(playerData.stats)) {
          for (const stat of playerData.stats) {
            if (!stat.playoffs && stat.gp > 0) {
              const ppg = stat.pts / stat.gp;
              const apg = stat.ast / stat.gp;
              const rpg = ((stat.orb || 0) + (stat.drb || 0)) / stat.gp;
              const bpg = (stat.blk || 0) / stat.gp;

              if (ppg >= 30 && !achievements.includes("Averaged 30+ PPG in a Season")) {
                achievements.push("Averaged 30+ PPG in a Season");
              }
              if (apg >= 10 && !achievements.includes("Averaged 10+ APG in a Season")) {
                achievements.push("Averaged 10+ APG in a Season");
              }
              if (rpg >= 15 && !achievements.includes("Averaged 15+ RPG in a Season")) {
                achievements.push("Averaged 15+ RPG in a Season");
              }
              if (bpg >= 3 && !achievements.includes("Averaged 3+ BPG in a Season")) {
                achievements.push("Averaged 3+ BPG in a Season");
              }
            }
          }
        }

        return {
          name: `${playerData.firstName} ${playerData.lastName}`,
          teams: Array.from(teams),
          years,
          achievements,
          careerWinShares: playerData.careerStats?.ws || 0,
          quality: 50, // Default quality
          pid: playerData.pid,
          stats: null,
          face: playerData.face || null,
          imageUrl: null
        };
      } catch (error) {
        console.warn(`Skipping invalid player:`, error);
        return null;
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Extract unique teams
  const teamNames = new Set<string>();
  players.forEach(player => {
    if (player) {
      player.teams.forEach(team => teamNames.add(team));
    }
  });

  const teams = Array.from(teamNames).map(name => ({ name, logo: undefined }));
  
  // Basic achievements list
  const achievements = [
    "20,000+ Career Points", "10,000+ Career Rebounds", "5,000+ Career Assists",
    "2,000+ Career Steals", "1,500+ Career Blocks", "2,000+ Made Threes",
    "Averaged 30+ PPG in a Season", "Averaged 10+ APG in a Season",
    "Averaged 15+ RPG in a Season", "Averaged 3+ BPG in a Season"
  ];

  return { players, teams, achievements };
}

export function FileUpload({ onGameGenerated, onTeamDataUpdate }: FileUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState<FileUploadData | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [urlInput, setUrlInput] = useState('');
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (fileOrUrl: File | string) => {
      console.log("Spawning parse worker…");
      let league: any;
      
      if (typeof fileOrUrl === 'string') {
        // URL upload with client-side parsing
        const { bytes, hinted } = await fetchLeagueBytes(fileOrUrl);
        
        // Check if the response looks like HTML (error page)
        const text = new TextDecoder().decode(bytes.slice(0, 100));
        if (text.trim().startsWith('<')) {
          throw new Error("This link returns a web page, not a file. Make sure it's a direct download link.");
        }
        
        league = await parseLeagueInWorker(bytes, hinted);
      } else {
        // File upload with client-side parsing
        const { bytes, hinted } = await fileToBytes(fileOrUrl);
        league = await parseLeagueInWorker(bytes, hinted);
      }
      
      // Process the league data entirely on the client side
      return processLeagueClientSide(league);
    },
    onSuccess: async (data) => {
      setUploadData(data);
      onTeamDataUpdate?.(data.teams);
      
      // Send processed data to server for storage (but not processing)
      try {
        const response = await apiRequest("POST", "/api/store-players", { players: data.players });
        await response.json();
      } catch (error) {
        console.warn("Failed to store players on server:", error);
        // Continue anyway - the game can work with client-side data
      }
      
      toast({
        title: uploadMode === 'url' ? "URL loaded successfully" : "File uploaded successfully",
        description: `Loaded ${data.players.length} players from ${data.teams.length} teams`,
      });
      
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
      setUploadedFile(file);
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

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
    uploadMutation.mutate(urlInput.trim());
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
      'application/gzip': ['.gz'],
      'application/x-gzip': ['.gz'],
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
                disabled={uploadMutation.isPending}
                data-testid="button-browse-files"
              >
                {uploadMutation.isPending ? (
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
                  placeholder="Paste league file URL (Dropbox, GitHub, Drive, etc.)"
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