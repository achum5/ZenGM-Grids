import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Player, GridCriteria } from "@shared/schema";
import { PlayerFace } from "./player-face";
import { useQuery } from "@tanstack/react-query";

interface PlayerProfileModalProps {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnCriteria?: GridCriteria;
  rowCriteria?: GridCriteria;
  rarity?: number;
  rank?: number;
  eligibleCount?: number;
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

export function PlayerProfileModal({ player, open, onOpenChange, columnCriteria, rowCriteria, rarity, rank, eligibleCount }: PlayerProfileModalProps) {
  if (!player) return null;

  // Fetch top players for this cell
  const { data: topPlayers } = useQuery<Array<{name: string, teams: string[]}>>({
    queryKey: [`/api/players/top-for-cell`, columnCriteria, rowCriteria, player?.name],
    enabled: open && !!columnCriteria && !!rowCriteria && !!player,
    queryFn: async () => {
      const params = new URLSearchParams({
        columnCriteria: JSON.stringify(columnCriteria),
        rowCriteria: JSON.stringify(rowCriteria),
        excludePlayer: player.name
      });
      const response = await fetch(`/api/players/top-for-cell?${params}`);
      if (!response.ok) throw new Error('Failed to fetch top players');
      return response.json();
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="player-modal no-scroll-x"
        style={{ background: 'var(--panel)', border: '1px solid var(--tile-border)' }}
      >
        <DialogHeader className="modal-header close-button">
          <DialogTitle className="fluid-text-lg" style={{ color: 'var(--text)' }}>Player Information</DialogTitle>
        </DialogHeader>
        
        <div className="modal-body scrollable-y">
          {/* Player Face and Name */}
          <div className="flex flex-col items-center modal-section">
            <PlayerFace 
              face={player.face}
              imageUrl={player.imageUrl}
              size={80} 
              className="player-avatar"
              teams={player.teams}
              currentTeam={player.years?.[player.years.length - 1]?.team}
            />
            <h2 className="fluid-text-xl font-bold text-center" style={{ color: 'var(--text)' }}>{player.name}</h2>
          </div>

          {/* Rarity Section */}
          {(rarity !== undefined && rank !== undefined && eligibleCount !== undefined) && (
            <div className="modal-section">
              <h3 className="fluid-text-base font-semibold mb-2" style={{ color: 'var(--brand)' }}>Rarity</h3>
              <div className="space-y-2">
                <div 
                  className="fluid-text-lg font-bold"
                  style={{ color: `hsl(${120 * (rarity / 100)} 85% 45%)` }}
                >
                  {getRarityText(rarity || 0)}
                </div>
                <div className="fluid-text-sm" style={{ color: 'var(--text)' }}>
                  Ranked {eligibleCount && rank ? eligibleCount - rank + 1 : rank} out of {eligibleCount} eligible players
                </div>
                <div className="fluid-text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  1 = rarest • {eligibleCount} = most common
                </div>
              </div>
            </div>
          )}

          {/* Teams Section */}
          <div className="modal-section">
            <h3 className="fluid-text-base font-semibold mb-2" style={{ color: 'hsl(210 85% 45%)' }}>Teams</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {player.years && player.years.length > 0 ? (
                // Sort teams chronologically by start year
                [...player.years]
                  .sort((a, b) => a.start - b.start)
                  .map((teamYear, idx) => (
                    <div key={`${teamYear.team}-${teamYear.start}-${idx}`} className="fluid-text-sm truncate" style={{ color: 'var(--text)' }}>
                      {teamYear.team} ({teamYear.start === teamYear.end ? teamYear.start : `${teamYear.start}–${teamYear.end}`})
                    </div>
                  ))
              ) : (
                player.teams.map((team, idx) => (
                  <div key={team} className="fluid-text-sm truncate" style={{ color: 'var(--text)' }}>{team}</div>
                ))
              )}
            </div>
          </div>

          {/* Other Top Answers Section */}
          <div className="modal-section">
            <h3 className="fluid-text-base font-semibold mb-2" style={{ color: 'hsl(45 85% 45%)' }}>Other Top Answers</h3>
            <div className="space-y-1 max-h-32 scrollable-y">
              {topPlayers && topPlayers.length > 0 ? (
                topPlayers.map((topPlayer, idx) => (
                  <div key={topPlayer.name} className="fluid-text-sm truncate" style={{ color: 'var(--text)' }}>
                    {idx + 1}. {topPlayer.name}
                  </div>
                ))
              ) : (
                <div className="fluid-text-sm" style={{ color: 'var(--muted-foreground)' }}>
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