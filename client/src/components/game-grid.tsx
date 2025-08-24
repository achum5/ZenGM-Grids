import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Clock, RotateCcw, Play } from "lucide-react";
import React from "react";
import { PlayerSearchModal } from "./player-search-modal";
import { CorrectAnswersModal } from "./correct-answers-modal";
import PlayerCellInfo from "./player-cell-info";
import { NameBar } from "./name-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Game, GameSession, GridCell, Player, TeamInfo } from "@shared/schema";

interface GameGridProps {
  gameId: string | null;
  sessionId: string | null;
  onSessionCreated: (sessionId: string) => void;
  onScoreUpdate: (score: number) => void;
  teamData?: TeamInfo[];
}

export function GameGrid({ gameId, sessionId, onSessionCreated, onScoreUpdate, teamData }: GameGridProps) {
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
        // Get top 5 players based on career win shares for this cell
        if (selectedCell && game) {
          const cellKey = `${selectedCell.row}_${selectedCell.col}`;
          const correctPlayersForCell = game.correctAnswers[cellKey] || [];
        
          if (correctPlayersForCell.length > 0) {
            // Fetch player details to sort by career win shares
            const fetchTopPlayers = async () => {
              try {
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
                
                const response = await apiRequest("GET", `/api/debug/matches?${queryParams}`);
                const correctPlayersData = await response.json();
                
                // Sort by career win shares and get top 5
                const sortedPlayers = correctPlayersData.players
                  ?.sort((a: any, b: any) => (b.careerWinShares || 0) - (a.careerWinShares || 0))
                  .slice(0, 5)
                  .map((p: any) => p.name) || [];
                
                toast({
                  title: "Incorrect",
                  description: sortedPlayers.length > 0 ? 
                    `Top answers: ${sortedPlayers.join(", ")}` :
                    "No valid answers found for this combination",
                  variant: "destructive",
                });
              } catch (error) {
                toast({
                  title: "Incorrect",
                  description: "No valid answers found for this combination",
                  variant: "destructive",
                });
              }
            };
            
            fetchTopPlayers();
          } else {
            toast({
              title: "Incorrect",
              description: "No valid answers found for this combination",
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Incorrect",
            description: "Unable to fetch answer details",
            variant: "destructive",
          });
        }
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

  // Calculate rarity statistics
  const answers = session?.answers ? Object.values(session.answers) : [];
  const correctRarities = answers.filter(a => a.correct).map(a => a.rarity || 0);
  const totalRarity = correctRarities.reduce((sum, rarity) => sum + rarity, 0);
  const averageRarity = correctRarities.length > 0 ? Math.round(totalRarity / correctRarities.length) : 0;
  const bestRarity = correctRarities.length > 0 ? Math.max(...correctRarities) : 0;
  const worstRarity = correctRarities.length > 0 ? Math.min(...correctRarities) : 0;

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

  // Helper to get rarity color
  const getRarityColor = (rarity: number) => {
    const hue = 120 * (rarity / 100); // 0 = red (0°), 100 = green (120°)
    return `hsl(${hue} 85% 45%)`;
  };

  return (
    <div className="no-scroll-x" style={{ background: 'var(--panel)', padding: 'clamp(16px, 3vmin, 24px)' }}>
      {/* Compact Stats Strip */}
      <div className="statsStrip" role="region" aria-label="Session stats">
        <div className="stat">
          <span className="val" style={{ color: 'hsl(120 85% 45%)' }} data-testid="text-correct-answers">{correctAnswers}</span>
          <span className="lbl">Correct</span>
        </div>
        <div className="stat">
          <span className="val" style={{ color: 'hsl(0 85% 45%)' }} data-testid="text-incorrect-answers">{incorrectAnswers}</span>
          <span className="lbl">Incorrect</span>
        </div>
        <div className="stat">
          <span className="val" data-testid="text-remaining-cells">{remainingCells}</span>
          <span className="lbl">Guesses Left</span>
        </div>
        <div className="stat">
          <span className="val" data-testid="text-total-rarity">{totalRarity}</span>
          <span className="lbl">Total Rarity</span>
        </div>
        <div className="stat">
          <span className="val" data-testid="text-average-rarity">{averageRarity}</span>
          <span className="lbl">Avg Rarity</span>
        </div>
        <div className="stat">
          <span className="val" style={{ color: 'hsl(120 85% 45%)' }} data-testid="text-best-rarity">{bestRarity}</span>
          <span className="lbl">Best</span>
        </div>
        <div className="stat">
          <span className="val" style={{ color: 'hsl(0 85% 45%)' }} data-testid="text-worst-rarity">{worstRarity}</span>
          <span className="lbl">Worst</span>
        </div>
      </div>

      {/* Game Grid */}
      <div className="gridWrap">
        <div className="grid" style={{ gridTemplateColumns: 'auto repeat(3, 1fr)' }}>
          {/* Top-left empty cell */}
          <div className="aspect-square"></div>
        
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
                <div 
                  key={cellKey} 
                  className={`game-tile ${isAnswered ? 'filled' : ''}`}
                  onClick={(e) => {
                    if (isAnswered) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    handleCellClick(rowIndex, colIndex);
                  }}
                  data-testid={`cell-${rowIndex}-${colIndex}`}
                >
                  {/* Rarity chip */}
                  {isAnswered && isCorrect && (
                    <div 
                      className="rarityChip rarity-chip"
                      style={{ '--rarity': answer.rarity || 0 } as React.CSSProperties}
                    >
                      {answer.rarity || 0}
                    </div>
                  )}
                  
                  {/* Player content */}
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
                  
                  {/* NameBar for answered cells */}
                  {isAnswered && (
                    <NameBar name={answer.player} />
                  )}
                  
                  {/* Empty cell hover text */}
                  {!isAnswered && (
                    <div className="fluid-text-sm" style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
                      Select Player
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        </div>
      </div>

      <PlayerSearchModal
        open={showPlayerModal}
        onOpenChange={setShowPlayerModal}
        onSelectPlayer={handlePlayerSelect}
        usedPlayers={session ? Object.values(session.answers).map(answer => answer.player) : []}
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
