import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timer, Trophy, CheckCircle, XCircle, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSessionJSON } from "@/lib/session";
import { useLocation } from "wouter";
import type { Grid, GridCriteria } from "@/lib/grid";
import type { GridPlayer } from "@/lib/processLeague";

interface GameState {
  answers: Record<string, string>; // "row-col" -> playerName
  correct: Record<string, boolean>; // "row-col" -> isCorrect
  score: number;
  timeStarted: number;
}

export function SimpleGameGrid() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Load data from session
  const grid: Grid | null = getSessionJSON("grid");
  const dataset: { players: GridPlayer[]; teams: any[] } | null = getSessionJSON("grid-dataset");
  
  // Game state
  const [gameState, setGameState] = useState<GameState>({
    answers: {},
    correct: {},
    score: 0,
    timeStarted: Date.now()
  });
  
  const [selectedCell, setSelectedCell] = useState<{row: number, col: number} | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes

  // Redirect if no data
  useEffect(() => {
    if (!grid || !dataset) {
      toast({
        title: "No game data found",
        description: "Please upload a league file first",
        variant: "destructive"
      });
      setLocation("/");
    }
  }, [grid, dataset, setLocation, toast]);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          toast({
            title: "Time's up!",
            description: `Final score: ${gameState.score}`,
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.score, toast]);

  if (!grid || !dataset) return null;

  const checkAnswer = (playerName: string, row: number, col: number): boolean => {
    const rowCriteria = grid.rows[row];
    const colCriteria = grid.cols[col];
    
    // Find the player in our dataset
    const player = dataset.players.find(p => 
      p.name.toLowerCase().includes(playerName.toLowerCase()) ||
      playerName.toLowerCase().includes(p.name.toLowerCase())
    );
    
    if (!player) return false;
    
    // Check if player meets both criteria (simplified - just team matching for now)
    const rowTeam = dataset.teams.find(t => t.name === rowCriteria.label);
    const colTeam = dataset.teams.find(t => t.name === colCriteria.label);
    
    if (!rowTeam || !colTeam) return false;
    
    const playedForRow = player.teams.some(pt => pt.tid === rowTeam.tid);
    const playedForCol = player.teams.some(pt => pt.tid === colTeam.tid);
    
    return playedForRow && playedForCol;
  };

  const submitAnswer = () => {
    if (!selectedCell || !playerSearch.trim()) return;
    
    const cellKey = `${selectedCell.row}-${selectedCell.col}`;
    const isCorrect = checkAnswer(playerSearch, selectedCell.row, selectedCell.col);
    
    setGameState(prev => ({
      ...prev,
      answers: { ...prev.answers, [cellKey]: playerSearch },
      correct: { ...prev.correct, [cellKey]: isCorrect },
      score: isCorrect ? prev.score + 1 : prev.score
    }));
    
    toast({
      title: isCorrect ? "Correct!" : "Incorrect",
      description: isCorrect ? "Great pick!" : "That player doesn't match the criteria",
      variant: isCorrect ? "default" : "destructive"
    });
    
    setSelectedCell(null);
    setPlayerSearch("");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          onClick={() => setLocation("/")}
          data-testid="button-back-home"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Upload
        </Button>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2" data-testid="game-timer">
            <Timer className="h-5 w-5" />
            <span className="font-mono font-bold">{formatTime(timeRemaining)}</span>
          </div>
          
          <div className="flex items-center space-x-2" data-testid="game-score">
            <Trophy className="h-5 w-5" />
            <span className="font-bold">{gameState.score}/9</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center">Basketball Immaculate Grid</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 max-w-2xl mx-auto">
            {/* Header row */}
            <div></div>
            {grid.cols.map((col, colIndex) => (
              <div key={colIndex} className="p-3 bg-gray-100 dark:bg-gray-800 text-center font-semibold text-sm">
                {col.label}
              </div>
            ))}
            
            {/* Data rows */}
            {grid.rows.map((row, rowIndex) => (
              <React.Fragment key={rowIndex}>
                {/* Row header */}
                <div className="p-3 bg-gray-100 dark:bg-gray-800 text-center font-semibold text-sm">
                  {row.label}
                </div>
                
                {/* Cells */}
                {grid.cols.map((_, colIndex) => {
                  const cellKey = `${rowIndex}-${colIndex}`;
                  const answer = gameState.answers[cellKey];
                  const isCorrect = gameState.correct[cellKey];
                  const isSelected = selectedCell?.row === rowIndex && selectedCell?.col === colIndex;
                  
                  return (
                    <button
                      key={colIndex}
                      onClick={() => setSelectedCell({row: rowIndex, col: colIndex})}
                      className={`
                        p-4 h-20 border-2 transition-all rounded-lg text-sm font-medium
                        ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'}
                        ${answer 
                          ? isCorrect 
                            ? 'bg-green-100 dark:bg-green-900/20 border-green-500' 
                            : 'bg-red-100 dark:bg-red-900/20 border-red-500'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }
                      `}
                      disabled={!!answer || timeRemaining === 0}
                      data-testid={`cell-${rowIndex}-${colIndex}`}
                    >
                      {answer ? (
                        <div className="flex items-center justify-center space-x-1">
                          {isCorrect ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="truncate">{answer}</span>
                        </div>
                      ) : (
                        isSelected ? "Select Player" : ""
                      )}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Player Input Modal */}
      {selectedCell && (
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="font-semibold">
                  {grid.rows[selectedCell.row].label} + {grid.cols[selectedCell.col].label}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enter a player who meets both criteria
                </p>
              </div>
              
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Player name..."
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitAnswer();
                    if (e.key === 'Escape') setSelectedCell(null);
                  }}
                  className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
                  autoFocus
                  data-testid="input-player-name"
                />
                
                <div className="flex space-x-2">
                  <Button onClick={submitAnswer} disabled={!playerSearch.trim()}>
                    Submit
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedCell(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}