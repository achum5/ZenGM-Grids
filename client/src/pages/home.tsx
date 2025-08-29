import { useState } from "react";
import { FileUpload } from "@/components/file-upload-new";
import { GameGrid } from "@/components/game-grid";
import { RulesModal } from "@/components/rules-modal";
import { Button } from "@/components/ui/button";
import { HelpCircle, RotateCcw, Play, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Game, SessionStats, TeamInfo, GameSession } from "@shared/schema";

export default function Home() {
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentScore, setCurrentScore] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [teamData, setTeamData] = useState<TeamInfo[] | null>(null);
  const { toast } = useToast();


  // Generate new grid mutation
  const generateGameMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/games/generate");
      return response.json() as Promise<Game>;
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
      setCurrentGameId(game.id);
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
    setCurrentGameId(null);
    setCurrentSessionId(null);
    setCurrentScore(0);
  };

  // Get session query for stats calculation
  const { data: session } = useQuery<GameSession>({
    queryKey: ['/api/sessions', currentSessionId],
    enabled: !!currentSessionId,
  });

  const hasLeague = Boolean(teamData);

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
              <FileUpload onGameGenerated={handleGameGenerated} onTeamDataUpdate={setTeamData} />
            </div>
          )}
          
          {hasLeague && (
            <>
              
              <GameGrid 
                gameId={currentGameId}
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
