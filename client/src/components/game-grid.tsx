import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Clock, RotateCcw, Play, Share2 } from "lucide-react";
import React from "react";
import { PlayerSearchModal } from "./player-search-modal";
import { CorrectAnswersModal } from "./correct-answers-modal";
import PlayerCellInfo from "./player-cell-info";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Game, GameSession, GridCell, Player, TeamInfo } from "@shared/schema";

// Team logo emojis for common NBA teams
const TEAM_LOGOS: Record<string, string> = {
  // Original 30 Teams
  'Los Angeles Lakers': '💜',
  'Boston Celtics': '☘️',
  'Chicago Bulls': '🐂',
  'Golden State Warriors': '🏀',
  'Miami Heat': '🔥',
  'San Antonio Spurs': '⚫',
  'Detroit Pistons': '🔴',
  'Philadelphia 76ers': '⭐',
  'New York Knicks': '🧡',
  'Utah Jazz': '🎵',
  'Portland Trail Blazers': '🌲',
  'Phoenix Suns': '☀️',
  'Seattle SuperSonics': '🌧️',
  'Orlando Magic': '✨',
  'Charlotte Hornets': '🐝',
  'Minnesota Timberwolves': '🐺',
  'Denver Nuggets': '⛰️',
  'Toronto Raptors': '🦖',
  'Vancouver Grizzlies': '🐻',
  'Milwaukee Bucks': '🦌',
  'Indiana Pacers': '🏃',
  'Atlanta Hawks': '🦅',
  'Cleveland Cavaliers': '⚔️',
  'Washington Wizards': '🔮',
  'Dallas Mavericks': '🤠',
  'Houston Rockets': '🚀',
  'Sacramento Kings': '👑',
  'Memphis Grizzlies': '🐻',
  'New Orleans Pelicans': '🦆',
  'Brooklyn Nets': '🕸️',
  'Oklahoma City Thunder': '⚡',
  'Los Angeles Clippers': '📎',
};

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
  // Pin/sticky headers state per spec point 1
  const [pinnedColumns, setPinnedColumns] = useState<Set<number>>(new Set());
  const [pinnedRows, setPinnedRows] = useState<Set<number>>(new Set());

  // Edit mode for dropdown headers per spec point 3
  const [editingHeader, setEditingHeader] = useState<{type: 'row' | 'col', index: number} | null>(null);
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [availableAchievements, setAvailableAchievements] = useState<string[]>([]);
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

  // Share game functionality per spec point 2
  const shareGameMutation = useMutation({
    mutationFn: async (gameId: string) => {
      const response = await apiRequest("POST", `/api/games/${gameId}/share`);
      return response.json();
    },
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.shareUrl);
      toast({
        title: "Grid shared!",
        description: "Share URL copied to clipboard",
      });
    },
    onError: () => {
      toast({
        title: "Share failed",
        description: "Could not share the grid",
        variant: "destructive",
      });
    },
  });

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


  // Pin/sticky header functionality per spec point 1
  const toggleColumnPin = (colIndex: number) => {
    setPinnedColumns(prev => {
      const newPinned = new Set(prev);
      if (newPinned.has(colIndex)) {
        newPinned.delete(colIndex);
      } else {
        newPinned.add(colIndex);
      }
      return newPinned;
    });
  };

  const toggleRowPin = (rowIndex: number) => {
    setPinnedRows(prev => {
      const newPinned = new Set(prev);
      if (newPinned.has(rowIndex)) {
        newPinned.delete(rowIndex);
      } else {
        newPinned.add(rowIndex);
      }
      return newPinned;
    });
  };

  // Helper function to render team logo or name for headers with pin functionality
  const renderTeamHeader = (criteria: any, index: number, type: 'row' | 'col') => {
    const isPinned = type === 'col' ? pinnedColumns.has(index) : pinnedRows.has(index);
    const onTogglePin = type === 'col' ? () => toggleColumnPin(index) : () => toggleRowPin(index);
    
    const content = criteria.type === 'team' ? (
      <div className="flex flex-col items-center gap-1">
        {TEAM_LOGOS[criteria.label] && (
          <div className="text-lg sm:text-xl">{TEAM_LOGOS[criteria.label]}</div>
        )}
        <div className="text-[9px] sm:text-xs font-semibold text-gray-900 dark:text-white leading-tight text-center break-words">
          {criteria.label}
        </div>
      </div>
    ) : (
      <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white leading-tight text-center">
        {criteria.label}
      </div>
    );

    return (
      <div className="relative w-full h-full group">
        <div className="text-center w-full h-full flex items-center justify-center px-1">
          {content}
        </div>
        {/* Pin toggle button per spec point 1 */}
        <button
          onClick={onTogglePin}
          className={`absolute top-1 right-1 w-4 h-4 rounded-full transition-all duration-200 flex items-center justify-center text-xs
            ${isPinned 
              ? 'bg-blue-500 text-white shadow-md' 
              : 'bg-gray-400 dark:bg-gray-600 text-white opacity-0 group-hover:opacity-100'
            } hover:scale-110`}
          data-testid={`button-pin-${type}-${index}`}
        >
          📌
        </button>
        {/* Pin indicator per spec point 1 */}
        {isPinned && (
          <div className="absolute inset-0 border-2 border-blue-500 rounded-sm pointer-events-none" />
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4 sm:p-8 rounded-xl shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4">
        <div className="text-gray-900 dark:text-white">
          <h2 className="text-xl sm:text-2xl font-bold">Immaculate Grid</h2>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => shareGameMutation.mutate(game.id)}
            disabled={shareGameMutation.isPending}
            variant="outline"
            size="sm"
            data-testid="button-share-grid"
          >
            <Share2 className="h-4 w-4 mr-1" />
            Share Grid
          </Button>
        </div>
      </div>

      {/* Game Grid */}
      <div className="grid grid-cols-4 gap-1 sm:gap-2 max-w-sm sm:max-w-2xl mx-auto">
        {/* Top-left empty cell */}
        <div className="aspect-square"></div>
        
        {/* Column headers */}
        {game.columnCriteria.map((criteria, index) => (
          <div
            key={`col-${index}`}
            className={`aspect-square border border-gray-300 dark:border-slate-600 flex items-center justify-center rounded-sm
              ${pinnedColumns.has(index) 
                ? 'bg-blue-100 dark:bg-blue-900' 
                : 'bg-gray-200 dark:bg-slate-700'
              }`}
            data-testid={`header-column-${index}`}
          >
            {renderTeamHeader(criteria, index, 'col')}
          </div>
        ))}

        {/* Grid rows */}
        {game.rowCriteria.map((rowCriteria, rowIndex) => (
          <div key={`row-${rowIndex}`} className="contents">
            {/* Row header */}
            <div
              className={`aspect-square border border-gray-300 dark:border-slate-600 flex items-center justify-center rounded-sm
                ${pinnedRows.has(rowIndex) 
                  ? 'bg-blue-100 dark:bg-blue-900' 
                  : 'bg-gray-200 dark:bg-slate-700'
                }`}
              data-testid={`header-row-${rowIndex}`}
            >
              {renderTeamHeader(rowCriteria, rowIndex, 'row')}
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
