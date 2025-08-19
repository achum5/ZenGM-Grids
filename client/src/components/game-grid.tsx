import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, RotateCcw } from "lucide-react";
import { PlayerSearchModal } from "./player-search-modal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Game, GameSession, GridCell } from "@shared/schema";

interface GameGridProps {
  gameId: string | null;
  sessionId: string | null;
  onSessionCreated: (sessionId: string) => void;
  onScoreUpdate: (score: number) => void;
}

export function GameGrid({ gameId, sessionId, onSessionCreated, onScoreUpdate }: GameGridProps) {
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes
  const [gameStarted, setGameStarted] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: game } = useQuery<Game>({
    queryKey: ["/api/games", gameId],
    enabled: !!gameId,
  });

  const { data: session } = useQuery<GameSession>({
    queryKey: ["/api/sessions", sessionId],
    enabled: !!sessionId,
  });

  const createSessionMutation = useMutation({
    mutationFn: async (gameId: string) => {
      const response = await apiRequest("POST", "/api/sessions", { gameId });
      return response.json() as Promise<GameSession>;
    },
    onSuccess: (session) => {
      onSessionCreated(session.id);
      setGameStarted(true);
    },
  });

  const submitAnswerMutation = useMutation({
    mutationFn: async ({ row, col, player }: { row: number; col: number; player: string }) => {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/answer`, { row, col, player });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions/stats"] });
      onScoreUpdate(data.session.score);
      
      if (data.isCorrect) {
        toast({
          title: "Correct!",
          description: "Great pick!",
        });
      } else {
        toast({
          title: "Incorrect",
          description: `Correct answers: ${data.correctPlayers?.join(", ")}`,
          variant: "destructive",
        });
      }
    },
  });

  // Timer effect
  useEffect(() => {
    if (!gameStarted || !sessionId) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setGameStarted(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStarted, sessionId]);

  // Auto-create session when game is loaded
  useEffect(() => {
    if (game && !sessionId) {
      createSessionMutation.mutate(game.id);
    }
  }, [game, sessionId]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCellClick = (row: number, col: number) => {
    if (!session || !session.answers || session.answers[`${row}_${col}`]) return;
    setSelectedCell({ row, col });
    setShowPlayerModal(true);
  };

  const handlePlayerSelect = (playerName: string) => {
    if (!selectedCell || !sessionId) return;
    
    submitAnswerMutation.mutate({
      row: selectedCell.row,
      col: selectedCell.col,
      player: playerName,
    });
    
    setShowPlayerModal(false);
    setSelectedCell(null);
  };

  const restartGame = () => {
    if (game) {
      createSessionMutation.mutate(game.id);
      setTimeRemaining(300);
    }
  };

  if (!game) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="text-gray-500">
            <p className="text-lg mb-2">No game loaded</p>
            <p className="text-sm">Upload a league file and generate a grid to start playing</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const correctAnswers = session && session.answers ? Object.values(session.answers).filter(a => a.correct).length : 0;
  const incorrectAnswers = session && session.answers ? Object.values(session.answers).filter(a => !a.correct).length : 0;
  const remainingCells = 9 - (session && session.answers ? Object.keys(session.answers).length : 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Immaculate Grid Challenge</CardTitle>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-gray-600">
              <Clock className="h-4 w-4" />
              <span data-testid="text-time-remaining">{formatTime(timeRemaining)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={restartGame}
              className="text-basketball hover:text-orange-600"
              data-testid="button-restart-game"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Game Grid */}
        <div className="grid grid-cols-4 gap-3 max-w-2xl mx-auto mb-6">
          {/* Empty corner cell */}
          <div className="aspect-square bg-gray-100 rounded-lg"></div>
          
          {/* Column headers */}
          {game.columnCriteria.map((criteria, index) => (
            <div
              key={`col-${index}`}
              className="aspect-square bg-basketball text-white rounded-lg flex items-center justify-center p-2"
              data-testid={`header-column-${index}`}
            >
              <div className="text-center">
                <div className="text-sm font-medium">{criteria.label}</div>
              </div>
            </div>
          ))}

          {/* Grid rows */}
          {game.rowCriteria.map((rowCriteria, rowIndex) => (
            <div key={`row-${rowIndex}`} className="contents">
              {/* Row header */}
              <div
                className="aspect-square bg-court text-white rounded-lg flex items-center justify-center p-2"
                data-testid={`header-row-${rowIndex}`}
              >
                <div className="text-center">
                  <div className="text-sm font-medium">{rowCriteria.label}</div>
                </div>
              </div>
              
              {/* Grid cells */}
              {game.columnCriteria.map((_, colIndex) => {
                const cellKey = `${rowIndex}_${colIndex}`;
                const answer = session?.answers?.[cellKey];
                const isAnswered = !!answer;
                const isCorrect = answer?.correct;
                
                return (
                  <div key={cellKey} className="relative aspect-square">
                    <Button
                      variant="outline"
                      className={`w-full h-full transition-all ${
                        isAnswered
                          ? isCorrect
                            ? "border-green-300 bg-green-50"
                            : "border-red-300 bg-red-50"
                          : "border-gray-200 bg-white hover:border-basketball hover:bg-orange-50 hover:shadow-md"
                      }`}
                      onClick={() => handleCellClick(rowIndex, colIndex)}
                      disabled={isAnswered || submitAnswerMutation.isPending}
                      data-testid={`cell-${rowIndex}-${colIndex}`}
                    >
                      {isAnswered && (
                        <div className="w-full h-full flex flex-col items-center justify-center text-center p-1">
                          <div className="text-sm font-medium text-court leading-tight">{answer.player}</div>
                          <div className={`text-xs ${isCorrect ? "text-green-600" : "text-red-600"}`}>
                            {isCorrect ? "✓" : "✗"}
                          </div>
                        </div>
                      )}
                    </Button>
                    {!isAnswered && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none">
                        <svg 
                          className="w-8 h-8 mb-2 text-gray-400" 
                          fill="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2M21 9V7L15 7.5V9M21 17V15L15 16.5V18M14 8.5C14 8.5 14 9.5 14 9.5H16V11L20 10V18L16 17V18.5H8V17L4 18V10L8 11V9.5H10C10 9.5 10 8.5 10 8.5C6 8.5 4 10.5 4 13.5S6 18.5 10 18.5V20C10 21.1 10.9 22 12 22S14 21.1 14 22V20C18 20 20 18 20 15S18 8.5 14 8.5Z"/>
                        </svg>
                        <div className="text-xs font-medium text-gray-500 leading-tight">Select Player</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Score display */}
        <div className="text-center">
          <div className="inline-flex items-center space-x-6 bg-gray-50 rounded-lg px-6 py-3">
            <div className="text-center">
              <div className="text-sm text-gray-600">Correct</div>
              <div className="text-xl font-bold text-green-600" data-testid="text-correct-answers">
                {correctAnswers}
              </div>
            </div>
            <div className="w-px h-8 bg-gray-300"></div>
            <div className="text-center">
              <div className="text-sm text-gray-600">Incorrect</div>
              <div className="text-xl font-bold text-red-600" data-testid="text-incorrect-answers">
                {incorrectAnswers}
              </div>
            </div>
            <div className="w-px h-8 bg-gray-300"></div>
            <div className="text-center">
              <div className="text-sm text-gray-600">Remaining</div>
              <div className="text-xl font-bold text-gray-600" data-testid="text-remaining-cells">
                {remainingCells}
              </div>
            </div>
          </div>
        </div>

        <PlayerSearchModal
          open={showPlayerModal}
          onOpenChange={setShowPlayerModal}
          onSelectPlayer={handlePlayerSelect}
        />
      </CardContent>
    </Card>
  );
}
