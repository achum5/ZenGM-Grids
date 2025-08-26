import { useState, useEffect } from "react";
import { FileUpload } from "@/components/file-upload";
import { GameGrid } from "@/components/game-grid";
import { GameStats } from "@/components/game-stats";
import { Stats } from "@/components/stats";
import { RulesModal } from "@/components/rules-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpCircle, RotateCcw, Play, Loader2, Share } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useParams, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { Game, SessionStats, TeamInfo, GameSession } from "@shared/schema";

export default function Home() {
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentScore, setCurrentScore] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [teamData, setTeamData] = useState<TeamInfo[] | null>(null);
  const [sharedGridInput, setSharedGridInput] = useState("");
  const { toast } = useToast();
  const params = useParams();
  const [location, setLocation] = useLocation();

  const { data: stats } = useQuery<SessionStats>({
    queryKey: ["/api/sessions/stats"],
  });

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

  // Load shared grid mutation
  const loadSharedGridMutation = useMutation({
    mutationFn: async (seed: string) => {
      const response = await apiRequest("GET", `/api/games/shared/${seed}`);
      return response.json() as Promise<Game>;
    },
    onSuccess: (game) => {
      handleGameGenerated(game);
      setLocation(`/grid/${game.seed}`);
      toast({
        title: "Shared grid loaded",
        description: "Ready to play!",
        duration: 1000,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to load shared grid",
        description: "That shared grid link is invalid.",
        variant: "destructive",
      });
    },
  });

  const handleGameGenerated = (game?: Game) => {
    if (game) {
      // Always reset state for new grid without page reload
      setCurrentGameId(game.id);
      setCurrentSessionId(null);
      setCurrentScore(0);
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

  const handleLoadSharedGrid = () => {
    if (!sharedGridInput.trim()) return;
    
    let seed = sharedGridInput.trim();
    
    // Extract seed from full URL if provided
    if (seed.includes('/grid/')) {
      const match = seed.match(/\/grid\/([^/?]+)/);
      if (match) {
        seed = match[1];
      }
    }
    
    loadSharedGridMutation.mutate(seed);
    setSharedGridInput("");
  };

  // Load shared grid from URL on mount
  useEffect(() => {
    if (params.seed && teamData) {
      loadSharedGridMutation.mutate(params.seed);
    }
  }, [params.seed, teamData]);

  // Get session query for stats calculation
  const { data: session } = useQuery<GameSession>({
    queryKey: ['/api/sessions', currentSessionId],
    enabled: !!currentSessionId,
  });

  // Calculate stats for Stats component - per spec point 6
  const calculateStats = () => {
    if (!session?.answers) {
      return {
        sessionScore: 0,
        correct: 0,
        incorrect: 0,
        guessesLeft: 9
      };
    }

    const answers = Object.values(session.answers);
    const correct = answers.filter(a => a.correct).length;
    const incorrect = answers.filter(a => !a.correct).length;
    const correctAnswers = answers.filter(a => a.correct);
    const perGuessScores = correctAnswers.map(a => a.perGuessScore || 0);
    
    return {
      sessionScore: session.score || 0, // Sum of 1-10 scores per spec
      correct,
      incorrect,
      guessesLeft: 9 - answers.length,
      bestPerGuess: perGuessScores.length > 0 ? Math.max(...perGuessScores) : undefined,
      avgPerGuess: perGuessScores.length > 0 ? perGuessScores.reduce((sum, score) => sum + score, 0) / perGuessScores.length : undefined
    };
  };

  const statsData = calculateStats();
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
              <Stats
                sessionScore={statsData.sessionScore}
                correct={statsData.correct}
                incorrect={statsData.incorrect}
                guessesLeft={statsData.guessesLeft}
                bestPerGuess={statsData.bestPerGuess}
                avgPerGuess={statsData.avgPerGuess}
              />
              
              <GameGrid 
                gameId={currentGameId}
                sessionId={currentSessionId}
                onSessionCreated={handleSessionCreated}
                onScoreUpdate={handleScoreUpdate}
                teamData={teamData || undefined}
              />
              
              {/* Generate New Grid and Play Shared Grid */}
              <div className="space-y-4">
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
                
                {/* Play a Shared Grid */}
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4 rounded-xl">
                  <div className="text-center mb-3">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Play a Shared Grid</h3>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Paste shared grid link or seed"
                      value={sharedGridInput}
                      onChange={(e) => setSharedGridInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLoadSharedGrid()}
                      className="flex-1"
                      data-testid="input-shared-grid"
                    />
                    <Button
                      onClick={handleLoadSharedGrid}
                      disabled={!sharedGridInput.trim() || loadSharedGridMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                      data-testid="button-load-shared"
                    >
                      {loadSharedGridMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Load"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="bg-white dark:bg-slate-800 rounded-lg">
                <FileUpload onGameGenerated={handleGameGenerated} onTeamDataUpdate={setTeamData} />
              </div>
            </>
          )}
          
          <div className="bg-white dark:bg-slate-800 rounded-lg">
            <GameStats 
              stats={stats} 
              currentSessionScore={session?.score || 0}
              isGameActive={!!currentSessionId}
            />
          </div>
        </div>
      </main>
      <RulesModal open={showRules} onOpenChange={setShowRules} />
    </div>
  );
}
