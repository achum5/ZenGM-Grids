import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Clock, RotateCcw } from "lucide-react";
import React from "react";
import { PlayerSearchModal } from "./player-search-modal";
import { CorrectAnswersModal } from "./correct-answers-modal";
import { PlayerCellInfo } from "./player-cell-info";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Game, GameSession, GridCell, Player } from "@shared/schema";

interface GameGridProps {
  gameId: string | null;
  sessionId: string | null;
  onSessionCreated: (sessionId: string) => void;
  onScoreUpdate: (score: number) => void;
}

export function GameGrid({ gameId, sessionId, onSessionCreated, onScoreUpdate }: GameGridProps) {
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showCorrectAnswersModal, setShowCorrectAnswersModal] = useState(false);
  const [correctAnswersData, setCorrectAnswersData] = useState<{
    players: string[];
    playerDetails: Player[];
    cellCriteria: { row: string; column: string };
  } | null>(null);
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
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions/stats"] });
      onScoreUpdate(data.session.score);
      
      if (data.isCorrect && selectedCell && game) {
        // Show correct answers modal for correct guesses
        const cellCriteria = {
          row: game.rowCriteria[selectedCell.row].label,
          column: game.columnCriteria[selectedCell.col].label
        };
        
        // Fetch all correct players for this cell
        const columnType = game.columnCriteria[selectedCell.col].type;
        const rowType = game.rowCriteria[selectedCell.row].type;
        
        let queryParams = "";
        if (columnType === "team" && rowType === "team") {
          queryParams = `team=${encodeURIComponent(game.columnCriteria[selectedCell.col].value)}&team2=${encodeURIComponent(game.rowCriteria[selectedCell.row].value)}`;
        } else if (columnType === "team") {
          queryParams = `team=${encodeURIComponent(game.columnCriteria[selectedCell.col].value)}&achievement=${encodeURIComponent(game.rowCriteria[selectedCell.row].value)}`;
        } else {
          queryParams = `team=${encodeURIComponent(game.rowCriteria[selectedCell.row].value)}&achievement=${encodeURIComponent(game.columnCriteria[selectedCell.col].value)}`;
        }
        
        try {
          const response = await apiRequest("GET", `/api/debug/matches?${queryParams}`);
          const correctPlayersData = await response.json();
          
          setCorrectAnswersData({
            players: correctPlayersData.players?.map((p: Player) => p.name) || [],
            playerDetails: correctPlayersData.players || [],
            cellCriteria
          });
          setShowCorrectAnswersModal(true);
        } catch (error) {
          console.error("Failed to fetch correct players:", error);
        }
        
        toast({
          title: "Correct!",
          description: "Great pick!",
        });
      } else if (data.isCorrect === false) {
        toast({
          title: "Incorrect",
          description: data.correctPlayers?.length > 0 ? 
            `Valid answers include: ${data.correctPlayers.slice(0, 3).join(", ")}${data.correctPlayers.length > 3 ? ' and others...' : ''}` :
            "No valid answers found for this combination",
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
      <div className="bg-slate-800 dark:bg-slate-900 p-8 rounded-xl">
        <div className="p-12 text-center">
          <div className="text-gray-500 dark:text-gray-400">
            <p className="text-lg mb-2">No game loaded</p>
            <p className="text-sm">Upload a league file and generate a grid to start playing</p>
          </div>
        </div>
      </div>
    );
  }

  const correctAnswers = session && session.answers ? Object.values(session.answers).filter(a => a.correct).length : 0;
  const incorrectAnswers = session && session.answers ? Object.values(session.answers).filter(a => !a.correct).length : 0;
  const remainingCells = 9 - (session && session.answers ? Object.keys(session.answers).length : 0);

  // Helper function to render team logo or name for headers
  const renderTeamHeader = (criteria: any) => {
    if (criteria.type === 'team') {
      // For now, display team name - can be enhanced with logos later
      return (
        <div className="text-center w-16 h-16 flex items-center justify-center">
          <div className="text-xs font-semibold text-white leading-tight text-center">
            {criteria.label}
          </div>
        </div>
      );
    }
    return (
      <div className="text-center w-16 h-16 flex items-center justify-center">
        <div className="text-xs font-semibold text-white leading-tight text-center">
          {criteria.label}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-800 dark:bg-slate-900 p-8 rounded-xl">
      {/* Header with stats */}
      <div className="flex justify-between items-center mb-8">
        <div className="text-white">
          <h2 className="text-xl font-bold">Immaculate Grid</h2>
        </div>
        
        {/* Stats display */}
        <div className="flex items-center space-x-6 text-white">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400" data-testid="text-correct-answers">
              {correctAnswers}
            </div>
            <div className="text-xs text-gray-300">CORRECT</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400" data-testid="text-incorrect-answers">
              {incorrectAnswers}
            </div>
            <div className="text-xs text-gray-300">INCORRECT</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white" data-testid="text-remaining-cells">
              {remainingCells}
            </div>
            <div className="text-xs text-gray-300">GUESSES LEFT</div>
          </div>
        </div>
      </div>

      {/* Game Grid */}
      <div className="grid grid-cols-4 gap-1 max-w-2xl mx-auto">
        {/* Top-left empty cell */}
        <div className="aspect-square"></div>
        
        {/* Column headers */}
        {game.columnCriteria.map((criteria, index) => (
          <div
            key={`col-${index}`}
            className="aspect-square bg-slate-700 dark:bg-slate-800 flex items-center justify-center"
            data-testid={`header-column-${index}`}
          >
            {renderTeamHeader(criteria)}
          </div>
        ))}

        {/* Grid rows */}
        {game.rowCriteria.map((rowCriteria, rowIndex) => (
          <div key={`row-${rowIndex}`} className="contents">
            {/* Row header */}
            <div
              className="aspect-square bg-slate-700 dark:bg-slate-800 flex items-center justify-center"
              data-testid={`header-row-${rowIndex}`}
            >
              {renderTeamHeader(rowCriteria)}
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
                    variant="ghost"
                    className={`w-full h-full border-0 transition-all duration-200 relative overflow-hidden group ${
                      isAnswered
                        ? isCorrect
                          ? "bg-green-500 hover:bg-green-600"
                          : "bg-red-500 hover:bg-red-600"
                        : "bg-slate-600 dark:bg-slate-700 hover:bg-slate-500 dark:hover:bg-slate-600"
                    }`}
                    onClick={() => handleCellClick(rowIndex, colIndex)}
                    disabled={isAnswered || submitAnswerMutation.isPending}
                    data-testid={`cell-${rowIndex}-${colIndex}`}
                  >
                    {isAnswered && (
                      <PlayerCellInfo 
                        playerName={answer.player}
                        isCorrect={!!isCorrect}
                        rarity={answer.rarity || 47}
                        cellCriteria={{
                          row: game.rowCriteria[rowIndex].label,
                          column: game.columnCriteria[colIndex].label
                        }}
                        candidateCount={game.correctAnswers[cellKey]?.length || 0}
                      />
                    )}
                    {!isAnswered && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-xs font-medium text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          Select Player
                        </div>
                      </div>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <PlayerSearchModal
        open={showPlayerModal}
        onOpenChange={setShowPlayerModal}
        onSelectPlayer={handlePlayerSelect}
      />

      {correctAnswersData && (
        <CorrectAnswersModal
          open={showCorrectAnswersModal}
          onOpenChange={setShowCorrectAnswersModal}
          correctPlayers={correctAnswersData.players}
          playerDetails={correctAnswersData.playerDetails}
          cellCriteria={correctAnswersData.cellCriteria}
        />
      )}
    </div>
  );
}
