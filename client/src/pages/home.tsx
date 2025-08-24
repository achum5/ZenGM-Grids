import { useState, useEffect } from "react";
import { FileUpload } from "@/components/file-upload";
import { GameGrid } from "@/components/game-grid";
import { GameStats } from "@/components/game-stats";
import { RulesModal } from "@/components/rules-modal";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HelpCircle, RotateCcw, Play, Trash2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useQuery } from "@tanstack/react-query";
import { 
  getLastLeagueId, 
  getLastGridId, 
  hasResumeData, 
  loadLeagueBlob, 
  loadGridState, 
  parseLeagueBlobToJson,
  deleteLeague,
  deleteGridState,
  saveGridState,
  debounce
} from "@/storage/localStore";
import type { Game, SessionStats, TeamInfo } from "@shared/schema";
import type { LeagueMeta, GridState } from "@/storage/localStore";

export default function Home() {
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentScore, setCurrentScore] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [teamData, setTeamData] = useState<TeamInfo[] | null>(null);
  const [currentLeagueId, setCurrentLeagueId] = useState<string | null>(null);
  const [leagueMeta, setLeagueMeta] = useState<LeagueMeta | null>(null);
  const [leagueJson, setLeagueJson] = useState<any>(null);
  const [currentGridState, setCurrentGridState] = useState<GridState | null>(null);
  const [showResumeAlert, setShowResumeAlert] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);

  const { data: stats } = useQuery<SessionStats>({
    queryKey: ["/api/sessions/stats"],
  });

  // Hydrate from local storage on startup
  useEffect(() => {
    const hydrate = async () => {
      try {
        const leagueId = getLastLeagueId();
        const gridId = getLastGridId();
        
        if (leagueId) {
          const loaded = await loadLeagueBlob(leagueId);
          if (loaded) {
            const { blob, meta } = loaded;
            const json = await parseLeagueBlobToJson(blob, meta.type);
            setCurrentLeagueId(meta.id);
            setLeagueMeta(meta);
            setLeagueJson(json);
            
            // Extract team data for UI
            if (json.teams) {
              setTeamData(json.teams);
            }
          }
        }
        
        if (gridId) {
          const saved = await loadGridState(gridId);
          if (saved && leagueId === saved.leagueId) {
            setCurrentGridState(saved);
            setCurrentGameId(saved.id); // Use grid ID as game ID
            setShowResumeAlert(true);
          }
        }
      } catch (error) {
        console.error("Hydration error:", error);
      } finally {
        setIsHydrating(false);
      }
    };
    
    hydrate();
  }, []);

  const handleLeagueLoaded = (leagueId: string, meta: LeagueMeta, json: any) => {
    setCurrentLeagueId(leagueId);
    setLeagueMeta(meta);
    setLeagueJson(json);
    
    // Extract team data for UI
    if (json.teams) {
      setTeamData(json.teams);
    }
  };

  const handleGameGenerated = (game?: Game) => {
    if (game && currentLeagueId) {
      // Create new grid state
      const gridState: GridState = {
        id: game.id,
        createdAt: Date.now(),
        leagueId: currentLeagueId,
        game: game, // Store the game data locally
        gridSpec: {
          columnCriteria: game.columnCriteria,
          rowCriteria: game.rowCriteria,
          correctAnswers: game.correctAnswers
        },
        guesses: [],
        stats: {
          correct: 0,
          incorrect: 0,
          guessesLeft: 9,
          rarityTotal: 0,
          rarityAvg: 0,
          rarityBest: 0,
          rarityWorst: 0
        },
        version: 1
      };
      
      setCurrentGridState(gridState);
      setCurrentGameId(game.id);
      setCurrentSessionId(null);
      setCurrentScore(0);
      setShowResumeAlert(false);
      
      // Save to local storage
      saveGridState(gridState);
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
    setCurrentGridState(null);
    setShowResumeAlert(false);
  };

  const handleRemoveLeague = async () => {
    if (currentLeagueId && currentGridState) {
      await deleteLeague(currentLeagueId);
      await deleteGridState(currentGridState.id);
      
      // Reset all state
      setCurrentLeagueId(null);
      setLeagueMeta(null);
      setLeagueJson(null);
      setCurrentGridState(null);
      setCurrentGameId(null);
      setCurrentSessionId(null);
      setCurrentScore(0);
      setTeamData(null);
      setShowResumeAlert(false);
    }
  };

  const handleStartNewGrid = () => {
    // Keep league but start fresh grid
    setCurrentGridState(null);
    setCurrentGameId(null);
    setCurrentSessionId(null);
    setCurrentScore(0);
    setShowResumeAlert(false);
  };

  if (isHydrating) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-basketball mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      {/* Resume Alert */}
      {showResumeAlert && currentGridState && leagueMeta && (
        <Alert className="mx-4 mt-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <AlertDescription className="flex items-center justify-between">
            <div>
              <strong>Resume session?</strong> You have a saved game in progress with {leagueMeta.name}.
            </div>
            <div className="flex gap-2 ml-4">
              <Button 
                size="sm" 
                onClick={() => setShowResumeAlert(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Resume
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleStartNewGrid}
              >
                Start New Grid
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleRemoveLeague}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove League
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Mobile: Game Area first when game exists */}
          {currentGameId && (
            <div className="lg:hidden lg:col-span-2 order-1">
              <GameGrid 
                gameId={currentGameId}
                sessionId={currentSessionId}
                onSessionCreated={handleSessionCreated}
                onScoreUpdate={handleScoreUpdate}
                teamData={teamData || undefined}
                gridState={currentGridState}
                onGridStateUpdate={setCurrentGridState}
              />
              

            </div>
          )}
          
          {/* Sidebar - shows first on mobile when no game, after game when game exists */}
          <div className={`lg:col-span-1 space-y-6 ${currentGameId ? 'order-2' : 'order-1'}`}>
            <div className="bg-white dark:bg-slate-800 rounded-lg">
              <FileUpload 
                onGameGenerated={handleGameGenerated} 
                onTeamDataUpdate={setTeamData}
                onLeagueLoaded={handleLeagueLoaded}
              />
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg">
              <GameStats stats={stats} />
            </div>
          </div>

          {/* Desktop Game Area */}
          <div className="hidden lg:block lg:col-span-2">
            <GameGrid 
              gameId={currentGameId}
              sessionId={currentSessionId}
              onSessionCreated={handleSessionCreated}
              onScoreUpdate={handleScoreUpdate}
              teamData={teamData || undefined}
              gridState={currentGridState}
              onGridStateUpdate={setCurrentGridState}
            />
          </div>
        </div>
      </main>
      <RulesModal open={showRules} onOpenChange={setShowRules} />
    </div>
  );
}
