import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { GameGrid } from "@/components/game-grid";
import { GameStats } from "@/components/game-stats";
import { RulesModal } from "@/components/rules-modal";
import { Button } from "@/components/ui/button";
import { HelpCircle, RotateCcw } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useQuery } from "@tanstack/react-query";
import type { Game, SessionStats } from "@shared/schema";

export default function Home() {
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentScore, setCurrentScore] = useState(0);
  const [showRules, setShowRules] = useState(false);

  const { data: stats } = useQuery<SessionStats>({
    queryKey: ["/api/sessions/stats"],
  });

  const handleGameGenerated = (game: Game) => {
    setCurrentGameId(game.id);
    setCurrentSessionId(null);
    setCurrentScore(0);
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-basketball rounded-lg flex items-center justify-center">
                <span className="text-white text-lg">🏀</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-court dark:text-white">Immaculate Grid</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Basketball-GM Edition</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <div className="text-right">
                <p className="text-sm text-gray-500 dark:text-gray-400">Current Score</p>
                <p className="text-lg font-semibold text-court dark:text-white" data-testid="text-current-score">
                  {currentScore}
                </p>
              </div>
              <Button
                onClick={handleRestart}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
                data-testid="button-restart"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Restart</span>
              </Button>
              <Button
                onClick={() => setShowRules(true)}
                className="bg-basketball text-white hover:bg-orange-600 flex items-center space-x-2"
                data-testid="button-rules"
              >
                <HelpCircle className="h-4 w-4" />
                <span>Rules</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg">
              <FileUpload onGameGenerated={handleGameGenerated} />
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg">
              <GameStats stats={stats} />
            </div>
          </div>

          {/* Game Area */}
          <div className="lg:col-span-2">
            <GameGrid 
              gameId={currentGameId}
              sessionId={currentSessionId}
              onSessionCreated={handleSessionCreated}
              onScoreUpdate={handleScoreUpdate}
            />
          </div>
        </div>
      </main>

      <RulesModal open={showRules} onOpenChange={setShowRules} />
    </div>
  );
}
