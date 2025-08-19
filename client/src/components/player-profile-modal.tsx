import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Player } from "@shared/schema";
import { PlayerFace } from "./player-face";

interface PlayerProfileModalProps {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlayerProfileModal({ player, open, onOpenChange }: PlayerProfileModalProps) {
  if (!player) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-md mx-auto bg-slate-800 border-slate-700" 
        aria-describedby="player-profile-description"
      >
        <DialogHeader className="text-center pb-4">
          <DialogTitle className="text-xl font-bold text-white">Player Profile</DialogTitle>
          <p id="player-profile-description" className="text-gray-400 mt-2 text-sm">Detailed player information</p>
        </DialogHeader>
        
        <div className="space-y-4 text-white">
          {/* Player Face and Name */}
          <div className="flex flex-col items-center">
            <PlayerFace 
              face={player.face} 
              size={80} 
              className="rounded-full mb-3"
            />
            <h2 className="text-lg font-bold text-center">{player.name}</h2>
          </div>

          {/* Teams Section */}
          <div className="bg-slate-700 rounded-lg p-4">
            <h3 className="font-semibold text-blue-300 mb-2">Teams</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {player.years && player.years.length > 0 ? (
                player.years.map((teamYear, idx) => (
                  <div key={`${teamYear.team}-${teamYear.start}`} className="text-sm">
                    {teamYear.team} ({teamYear.start === teamYear.end ? teamYear.start : `${teamYear.start}–${teamYear.end}`})
                  </div>
                ))
              ) : (
                player.teams.map((team, idx) => (
                  <div key={team} className="text-sm">{team}</div>
                ))
              )}
            </div>
          </div>

          {/* Player Statistics */}
          <div className="bg-slate-700 rounded-lg p-4">
            <h3 className="font-semibold text-blue-300 mb-3">Statistics</h3>
            
            {player.stats && Array.isArray(player.stats) && player.stats.length > 0 && (
              <div className="space-y-3 text-sm">
                {/* Career Totals */}
                <div>
                  <div className="font-semibold text-white mb-1">Career</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>G: {player.stats.reduce((sum: number, s: any) => sum + (s.gp || 0), 0)}</div>
                    <div>PTS: {player.stats.reduce((sum: number, s: any) => sum + (s.pts || 0), 0).toFixed(0)}</div>
                    <div>REB: {player.stats.reduce((sum: number, s: any) => sum + (s.trb || 0), 0).toFixed(0)}</div>
                    <div>AST: {player.stats.reduce((sum: number, s: any) => sum + (s.ast || 0), 0).toFixed(0)}</div>
                    <div>FG%: {(player.stats.reduce((sum: number, s: any) => sum + (s.fgp || 0), 0) / player.stats.length).toFixed(1)}%</div>
                    <div>FT%: {(player.stats.reduce((sum: number, s: any) => sum + (s.ftp || 0), 0) / player.stats.length).toFixed(1)}%</div>
                  </div>
                </div>

                {/* Peak Season */}
                {(() => {
                  const peakSeason = player.stats.reduce((best: any, current: any) => 
                    (current.pts || 0) > (best.pts || 0) ? current : best
                  );
                  return (
                    <div>
                      <div className="font-semibold text-white mb-1">Peak Season ({peakSeason.season})</div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>G: {peakSeason.gp || 0}</div>
                        <div>PPG: {(peakSeason.pts || 0).toFixed(1)}</div>
                        <div>RPG: {(peakSeason.trb || 0).toFixed(1)}</div>
                        <div>APG: {(peakSeason.ast || 0).toFixed(1)}</div>
                        <div>FG%: {(peakSeason.fgp || 0).toFixed(1)}%</div>
                        <div>FT%: {(peakSeason.ftp || 0).toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Awards Section */}
          {player.achievements && player.achievements.length > 0 && (
            <div className="bg-slate-700 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-300 mb-2">Awards</h3>
              <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                {player.achievements.map((achievement, idx) => (
                  <div key={idx}>{achievement}</div>
                ))}
              </div>
            </div>
          )}

          {/* Career Info */}
          <div className="bg-slate-700 rounded-lg p-4">
            <h3 className="font-semibold text-green-300 mb-2">Career Info</h3>
            <div className="text-sm space-y-1">
              <div>Career Win Shares: {player.careerWinShares || 0}</div>
              <div>Player Quality: {player.quality || 50}</div>
              {player.stats && Array.isArray(player.stats) && player.stats.length > 0 && (
                <div>Seasons Played: {player.stats.length}</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}