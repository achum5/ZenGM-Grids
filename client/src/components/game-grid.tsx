import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Clock, RotateCcw, Play } from "lucide-react";
import React from "react";
import { PlayerSearchModal } from "./player-search-modal";
import { CorrectAnswersModal } from "./correct-answers-modal";
import PlayerCellInfo from "./player-cell-info";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Game, GameSession, GridCell, Player, TeamInfo } from "@shared/schema";

interface GameGridProps {
  game: Game | null;
  sessionId: string | null;
  onSessionCreated: (sessionId: string) => void;
  onScoreUpdate: (score: number) => void;
  teamData?: TeamInfo[];
  playerData?: any[];
}

export function GameGrid({ game, sessionId, onSessionCreated, onScoreUpdate, teamData, playerData }: GameGridProps) {
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

  // Calculate current score from correct answers with rarity values
  const getCurrentScore = () => {
    if (!session?.answers) return 0;
    
    const correctAnswers = Object.values(session.answers).filter(answer => answer.correct);
    return correctAnswers.reduce((total, answer) => total + (answer.rarity || 0), 0);
  };

  // Game data is now passed directly as a prop, no need to fetch from server

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
        // Incorrect answer - just render the incorrect state with no toast
        // The modal will show "Why this was incorrect" details
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


  // Helper function to render team logo or name for headers
  const renderTeamHeader = (criteria: any) => {
    if (criteria.type === 'team') {
      // For now, display team name - can be enhanced with logos later
      return (
        <div className="text-center w-full h-full flex items-center justify-center px-1">
          <div className="text-[9px] sm:text-xs font-semibold text-gray-900 dark:text-white leading-tight text-center break-words">
            {criteria.label}
          </div>
        </div>
      );
    }
    return (
      <div className="text-center w-full h-full flex items-center justify-center px-1">
        <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white leading-tight text-center">
          {criteria.label}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4 sm:p-8 rounded-xl shadow-sm">

      {/* Game Grid */}
      <div className="grid grid-cols-4 gap-1 sm:gap-2 max-w-sm sm:max-w-2xl mx-auto">
        {/* Top-left cell with Score display */}
        <div className="aspect-square flex flex-col items-center justify-center p-1">
          <div 
            className="text-center leading-tight"
            aria-live="polite"
            data-testid="score-display"
          >
            <div className="text-sm sm:text-lg md:text-xl font-bold text-gray-800 dark:text-gray-200">
              Score:
            </div>
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
              {session && Object.values(session.answers || {}).some(a => a.correct) ? getCurrentScore() : ''}
            </div>
          </div>
        </div>
        
        {/* Column headers */}
        {game.columnCriteria.map((criteria, index) => (
          <div
            key={`col-${index}`}
            className="aspect-square bg-gray-200 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 flex items-center justify-center rounded-sm"
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
              className="aspect-square bg-gray-200 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 flex items-center justify-center rounded-sm"
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
                    className={`w-full h-full border-0 transition-all duration-200 relative overflow-hidden group rounded-sm ${
                      isAnswered
                        ? isCorrect
                          ? "bg-green-500 hover:bg-green-600"
                          : "bg-red-500 hover:bg-red-600"
                        : "bg-gray-300 dark:bg-slate-600 hover:bg-gray-400 dark:hover:bg-slate-500 border border-gray-400 dark:border-slate-500"
                    }`}
                    onClick={(e) => {
                      // Don't handle click if cell is answered (let PlayerCellInfo handle it)
                      if (isAnswered) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      handleCellClick(rowIndex, colIndex);
                    }}
                    disabled={submitAnswerMutation.isPending}
                    data-testid={`cell-${rowIndex}-${colIndex}`}
                  >
                    {isAnswered && (
                      <PlayerCellInfo 
                        playerName={answer.player}
                        isCorrect={!!isCorrect}
                        rarity={answer.rarity || 0}
                        rank={answer.rank || 0}
                        eligibleCount={answer.eligibleCount || 0}
                        cellCriteria={game ? {
                          row: game.rowCriteria[rowIndex].label,
                          column: game.columnCriteria[colIndex].label
                        } : undefined}
                        candidateCount={game?.correctAnswers[cellKey]?.length || 0}
                        teamData={teamData}
                        columnCriteria={game?.columnCriteria[colIndex]}
                        rowCriteria={game?.rowCriteria[rowIndex]}
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
        usedPlayers={session ? Object.values(session.answers).map(answer => answer.player) : []}
        playerData={playerData || []}
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
