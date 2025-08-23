import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Player, GridCriteria } from "@shared/schema";
import { PlayerFace } from "./player-face";
import { useQuery } from "@tanstack/react-query";
import { rarityLabel } from "@/utils/rarityWS";

interface PlayerProfileModalProps {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnCriteria?: GridCriteria;
  rowCriteria?: GridCriteria;
  rarity?: number;
  rarityRank?: number;
  eligibleCount?: number;
}

export function PlayerProfileModal({ player, open, onOpenChange, columnCriteria, rowCriteria, rarity, rarityRank, eligibleCount }: PlayerProfileModalProps) {
  if (!player) return null;

  // Fetch all eligible players for this cell in WS rank order
  const { data: allPlayers } = useQuery<Array<{name: string, teams: string[], careerWinShares: number}>>({
    queryKey: [`/api/players/all-for-cell`, columnCriteria, rowCriteria],
    enabled: open && !!columnCriteria && !!rowCriteria,
    queryFn: async () => {
      const params = new URLSearchParams({
        columnCriteria: JSON.stringify(columnCriteria),
        rowCriteria: JSON.stringify(rowCriteria)
      });
      const response = await fetch(`/api/players/all-for-cell?${params}`);
      if (!response.ok) throw new Error('Failed to fetch all players');
      return response.json();
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

          {/* Rarity Section */}
          {typeof rarity === "number" && rarityRank && eligibleCount && (
            <div className="bg-slate-700 rounded-lg p-4">
              <h3 className="font-semibold text-purple-300 mb-2">Rarity</h3>
              <div className="text-2xl font-bold mb-1">{Math.round(rarity)}</div>
              <div className="text-sm text-gray-300">
                Rank {rarityRank} of {eligibleCount} eligible • {rarityLabel(rarity)}
              </div>
            </div>
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

          {/* Other Answers Section */}
          <div className="bg-slate-700 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-300 mb-2">Other Answers</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {allPlayers && allPlayers.length > 0 ? (
                allPlayers.map((answerPlayer, idx) => {
                  const isChosen = answerPlayer.name === player.name;
                  return (
                    <div key={answerPlayer.name} className="text-sm truncate">
                      <span style={{ fontWeight: isChosen ? 800 : 500 }}>
                        {idx + 1}. {answerPlayer.name}
                      </span>
                      <span className="text-gray-400"> — WS {answerPlayer.careerWinShares?.toFixed(1) || '0.0'}</span>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-gray-400">
                  {columnCriteria && rowCriteria ? "Loading players..." : "No criteria available"}
                </div>
              )}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}