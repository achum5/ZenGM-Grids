import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Player, GridCriteria } from "@shared/schema";
import { PlayerFace } from "./player-face";
import { useQuery } from "@tanstack/react-query";
import type { EvaluationResult } from "@shared/evaluation";
import { buildIncorrectMessage, evaluatePlayerAnswer } from "@shared/evaluation";

interface PlayerProfileModalProps {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnCriteria?: GridCriteria;
  rowCriteria?: GridCriteria;
  rarity?: number;
  rank?: number;
  eligibleCount?: number;
  isCorrect?: boolean;
  evaluation?: EvaluationResult;
}

// Function to get rarity text based on user's tier specifications
function getRarityText(rarity: number): string {
  if (rarity >= 90) return "Ultra rare";
  if (rarity >= 75) return "Very rare";
  if (rarity >= 60) return "Rare";
  if (rarity >= 40) return "Notable";
  if (rarity >= 25) return "Common";
  if (rarity >= 10) return "Very common";
  return "Ultra common";
}

// Function to get rarity color based on percentile
function getRarityColor(rarity: number): string {
  if (rarity >= 90) return "text-green-400";
  if (rarity >= 75) return "text-green-300"; 
  if (rarity >= 60) return "text-blue-400";
  if (rarity >= 40) return "text-yellow-400";
  if (rarity >= 25) return "text-orange-400";
  if (rarity >= 10) return "text-red-400";
  return "text-red-500";
}

// Component to display colored incorrect message per spec 4.A
function IncorrectMessageDisplay({ playerName, evaluation }: { playerName: string, evaluation: EvaluationResult }) {
  const message = buildIncorrectMessage(playerName, evaluation);
  
  // Split message into parts for coloring - simple approach for now
  // Green for correct parts, red for incorrect parts
  const parts = message.split(' but ');
  if (parts.length === 2) {
    // Handle "Player X did Y but did not Z" format
    const [correctPart, incorrectPart] = parts;
    return (
      <p className="text-gray-200">
        <span className="text-green-400">{correctPart}</span>
        <span> but </span>
        <span className="text-red-400">{incorrectPart}</span>
      </p>
    );
  }
  
  const andParts = message.split(' and ');
  if (andParts.length === 2) {
    // Handle "Player X did not Y and did not Z" format - both red
    return (
      <p className="text-red-400">{message}</p>
    );
  }
  
  // Handle "neither...nor" format - all red
  if (message.includes('neither') && message.includes('nor')) {
    return <p className="text-red-400">{message}</p>;
  }
  
  // Default fallback
  return <p className="text-gray-200">{message}</p>;
}

export function PlayerProfileModal({ player, open, onOpenChange, columnCriteria, rowCriteria, rarity, rank, eligibleCount, isCorrect = true, evaluation }: PlayerProfileModalProps) {
  if (!player) return null;

  // Fetch top players for this cell - show for both correct and incorrect
  const { data: topPlayers } = useQuery<Array<{name: string, teams: string[], __isGuessed?: boolean}>>({
    queryKey: [`/api/players/top-for-cell`, columnCriteria, rowCriteria, player?.name],
    enabled: open && !!columnCriteria && !!rowCriteria && !!player,
    queryFn: async () => {
      const params = new URLSearchParams({
        columnCriteria: JSON.stringify(columnCriteria),
        rowCriteria: JSON.stringify(rowCriteria),
        includeGuessed: 'true' // Don't exclude the guessed player
      });
      const response = await fetch(`/api/players/top-for-cell?${params}`);
      if (!response.ok) throw new Error('Failed to fetch top players');
      const result = await response.json();
      
      // Mark the guessed player if they're in the list
      return result.map((p: any, idx: number) => ({
        ...p,
        __isGuessed: p.name === player.name
      }));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-md bg-slate-800 border-slate-700 max-h-[80vh] overflow-y-auto"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Player Information</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 text-white">
          {/* Player Face and Name */}
          <div className="flex flex-col items-center">
            <PlayerFace 
              face={player.face}
              imageUrl={player.imageUrl}
              size={80} 
              className="rounded-full mb-3"
              teams={player.teams}
              currentTeam={player.years?.[player.years.length - 1]?.team}
            />
            <h2 className="text-lg font-bold text-center">{player.name}</h2>
          </div>

          {/* Rarity Section for correct answers OR Why this was incorrect for wrong answers */}
          {isCorrect ? (
            (rarity !== undefined && rank !== undefined && eligibleCount !== undefined) && (
              <div className="bg-slate-700 rounded-lg p-4">
                <h3 className="font-semibold text-purple-300 mb-2">Rarity</h3>
                <div className="space-y-2">
                  <div className={`text-lg font-bold ${getRarityColor(rarity || 0)}`}>
                    {getRarityText(rarity || 0)}
                  </div>
                  <div className="text-sm text-gray-300">
                    Ranked {eligibleCount && rank ? eligibleCount - rank + 1 : rank} out of {eligibleCount} eligible players for this cell
                  </div>
                  <div className="text-xs text-gray-400">
                    1 = rarest · {eligibleCount} = most common
                  </div>
                </div>
              </div>
            )
          ) : (
            evaluation && (
              <div className="bg-slate-700 rounded-lg p-4">
                <h3 className="font-semibold text-red-300 mb-2">Why this was incorrect</h3>
                <div className="explain font-semibold text-sm">
                  <IncorrectMessageDisplay playerName={player.name} evaluation={evaluation} />
                </div>
              </div>
            )
          )}

          {/* Teams Section */}
          <div className="bg-slate-700 rounded-lg p-4">
            <h3 className="font-semibold text-blue-300 mb-2">Teams</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {player.years && player.years.length > 0 ? (
                // Sort teams chronologically by start year
                [...player.years]
                  .sort((a, b) => a.start - b.start)
                  .map((teamYear, idx) => (
                    <div key={`${teamYear.team}-${teamYear.start}-${idx}`} className="text-sm truncate">
                      {teamYear.team} ({teamYear.start === teamYear.end ? teamYear.start : `${teamYear.start}–${teamYear.end}`})
                    </div>
                  ))
              ) : (
                player.teams.map((team, idx) => (
                  <div key={team} className="text-sm truncate">{team}</div>
                ))
              )}
            </div>
          </div>

          {/* Other Top Answers Section */}
          <div className="bg-slate-700 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-300 mb-2">Other Top Answers</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {topPlayers && topPlayers.length > 0 ? (
                topPlayers.map((topPlayer, idx) => (
                  <div 
                    key={topPlayer.name} 
                    className={`text-sm truncate ${topPlayer.__isGuessed ? 'font-bold text-yellow-300' : ''}`}
                  >
                    {idx + 1}. {topPlayer.name}
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-400">
                  {columnCriteria && rowCriteria ? "Loading top players..." : "No criteria available"}
                </div>
              )}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}