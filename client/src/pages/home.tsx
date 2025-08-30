import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { GameGrid } from "@/components/game-grid";
import { RulesModal } from "@/components/rules-modal";
import { Button } from "@/components/ui/button";
import { HelpCircle, RotateCcw, Play, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { buildGridFromFileUploadData } from "@shared/grid";
import type { Game, SessionStats, TeamInfo, GameSession, FileUploadData } from "@shared/schema";

export default function Home() {
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentScore, setCurrentScore] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [teamData, setTeamData] = useState<TeamInfo[] | null>(null);
  const [uploadData, setUploadData] = useState<FileUploadData | null>(null);
  const { toast } = useToast();


  // Generate new grid using client-side data
  const generateGameMutation = useMutation({
    mutationFn: async (): Promise<Game> => {
      if (!uploadData) {
        throw new Error("No league data available. Please upload a league file first.");
      }
      
      console.log("🎯 Starting client-side grid generation...");
      const game = buildGridFromFileUploadData(uploadData);
      
      if (!game) {
        throw new Error("Failed to generate a valid grid. Please try again.");
      }
      
      console.log("✅ Client-side grid generated successfully!", {
        gameId: game.id,
        columnCount: game.columnCriteria.length,
        rowCount: game.rowCriteria.length
      });
      
      return game;
    },
    onSuccess: (game) => {
      handleGameGenerated(game);
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

  const handleGameGenerated = (game?: Game) => {
    if (game) {
      // Always reset state for new grid without page reload
      setCurrentGame(game);
      setCurrentSessionId(null);
      setCurrentScore(0); // Reset score display
    }
  };

  const handleSessionCreated = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  const handleScoreUpdate = (score: number) => {
    setCurrentScore(score);
  };

  const handleRestart = () => {
    setCurrentGame(null);
    setCurrentSessionId(null);
    setCurrentScore(0);
  };

  // Get session query for stats calculation
  const { data: session } = useQuery<GameSession>({
    queryKey: ['/api/sessions', currentSessionId],
    enabled: !!currentSessionId,
  });

  const hasLeague = Boolean(uploadData);

  const handleUploadDataUpdate = (data: FileUploadData | null) => {
    setUploadData(data);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 overflow-hidden">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-basketball rounded-lg flex items-center justify-center">
                <span className="text-white text-lg">🏀</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-court dark:text-white">ZenGM Grids</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Basketball-GM Edition</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {!hasLeague && (
            <div className="bg-white dark:bg-slate-800 rounded-lg">
              <FileUpload 
                onGameGenerated={handleGameGenerated} 
                onTeamDataUpdate={setTeamData}
                onUploadDataUpdate={handleUploadDataUpdate}
              />
            </div>
          )}
          
          {hasLeague && (
            <>
              
              <GameGrid 
                game={currentGame}
                sessionId={currentSessionId}
                onSessionCreated={handleSessionCreated}
                onScoreUpdate={handleScoreUpdate}
                teamData={teamData || undefined}
              />
              
              {/* Generate New Grid Button */}
              <div className="flex justify-center">
                <Button 
                  onClick={() => generateGameMutation.mutate()}
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
              
              <div className="bg-white dark:bg-slate-800 rounded-lg">
                <FileUpload onGameGenerated={handleGameGenerated} onTeamDataUpdate={setTeamData} />
              </div>
            </>
          )}
          
        </div>
      </main>
      <RulesModal open={showRules} onOpenChange={setShowRules} />
    </div>
  );
}
