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
            
            {(() => {
              // Check if we have actual game statistics vs just ratings
              const hasActualGameStats = player.stats?.some((s: any) => 
                s.mp !== undefined || s.pts !== undefined || s.trb !== undefined || 
                s.ast !== undefined || s.gp !== undefined || s.g !== undefined
              );
              
              if (hasActualGameStats) {
                // Display actual game statistics
                const isRetired = player.achievements?.includes("Retired");
                const validSeasons = player.stats?.filter((s: any) => (s.gp || s.g || 0) > 0) || [];
                
                if (isRetired && validSeasons.length > 0) {
                  // Retired player - show peak and career
                  const peakSeason = validSeasons.reduce((best: any, current: any) => 
                    (current.pts || 0) > (best.pts || 0) ? current : best
                  );
                  
                  return (
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="font-semibold text-white mb-1">Peak Season ({peakSeason.season || 'N/A'})</div>
                        <div className="grid grid-cols-5 gap-1 text-xs">
                          <div>MPG: {((peakSeason.mp || 0) / (peakSeason.gp || peakSeason.g || 1)).toFixed(1)}</div>
                          <div>PPG: {((peakSeason.pts || 0) / (peakSeason.gp || peakSeason.g || 1)).toFixed(1)}</div>
                          <div>RPG: {((peakSeason.trb || 0) / (peakSeason.gp || peakSeason.g || 1)).toFixed(1)}</div>
                          <div>APG: {((peakSeason.ast || 0) / (peakSeason.gp || peakSeason.g || 1)).toFixed(1)}</div>
                          <div>FG%: {((peakSeason.fgp || peakSeason.fg_pct || 0) * 100).toFixed(1)}%</div>
                          <div>3P%: {((peakSeason.tpp || peakSeason.tp_pct || 0) * 100).toFixed(1)}%</div>
                          <div>FT%: {((peakSeason.ftp || peakSeason.ft_pct || 0) * 100).toFixed(1)}%</div>
                          <div>TS%: {((peakSeason.tsp || peakSeason.ts_pct || 0) * 100).toFixed(1)}%</div>
                          <div>PER: {(peakSeason.per || 0).toFixed(1)}</div>
                          <div>WS: {(peakSeason.ws || 0).toFixed(1)}</div>
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-white mb-1">Career</div>
                        <div className="grid grid-cols-5 gap-1 text-xs">
                          <div>MPG: {validSeasons.length > 0 ? (validSeasons.reduce((sum: number, s: any) => sum + ((s.mp || 0) / (s.gp || s.g || 1)), 0) / validSeasons.length).toFixed(1) : "0.0"}</div>
                          <div>PPG: {validSeasons.length > 0 ? (validSeasons.reduce((sum: number, s: any) => sum + ((s.pts || 0) / (s.gp || s.g || 1)), 0) / validSeasons.length).toFixed(1) : "0.0"}</div>
                          <div>RPG: {validSeasons.length > 0 ? (validSeasons.reduce((sum: number, s: any) => sum + ((s.trb || 0) / (s.gp || s.g || 1)), 0) / validSeasons.length).toFixed(1) : "0.0"}</div>
                          <div>APG: {validSeasons.length > 0 ? (validSeasons.reduce((sum: number, s: any) => sum + ((s.ast || 0) / (s.gp || s.g || 1)), 0) / validSeasons.length).toFixed(1) : "0.0"}</div>
                          <div>FG%: {validSeasons.length > 0 ? ((validSeasons.reduce((sum: number, s: any) => sum + (s.fgp || s.fg_pct || 0), 0) / validSeasons.length) * 100).toFixed(1) : "0.0"}%</div>
                          <div>3P%: {validSeasons.length > 0 ? ((validSeasons.reduce((sum: number, s: any) => sum + (s.tpp || s.tp_pct || 0), 0) / validSeasons.length) * 100).toFixed(1) : "0.0"}%</div>
                          <div>FT%: {validSeasons.length > 0 ? ((validSeasons.reduce((sum: number, s: any) => sum + (s.ftp || s.ft_pct || 0), 0) / validSeasons.length) * 100).toFixed(1) : "0.0"}%</div>
                          <div>TS%: {validSeasons.length > 0 ? ((validSeasons.reduce((sum: number, s: any) => sum + (s.tsp || s.ts_pct || 0), 0) / validSeasons.length) * 100).toFixed(1) : "0.0"}%</div>
                          <div>PER: {validSeasons.length > 0 ? (validSeasons.reduce((sum: number, s: any) => sum + (s.per || 0), 0) / validSeasons.length).toFixed(1) : "0.0"}</div>
                          <div>WS: {(player.careerWinShares || (player as any).careerWS || 0).toFixed(1)}</div>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  // Active player or no valid seasons
                  const currentSeason = player.stats?.[player.stats.length - 1];
                  return (
                    <div className="space-y-3 text-sm">
                      {currentSeason && (
                        <>
                          <div>
                            <div className="font-semibold text-white mb-1">Current Season ({currentSeason.season || 'N/A'})</div>
                            <div className="grid grid-cols-5 gap-1 text-xs">
                              <div>MPG: {((currentSeason.mp || 0) / (currentSeason.gp || currentSeason.g || 1)).toFixed(1)}</div>
                              <div>PPG: {((currentSeason.pts || 0) / (currentSeason.gp || currentSeason.g || 1)).toFixed(1)}</div>
                              <div>RPG: {((currentSeason.trb || 0) / (currentSeason.gp || currentSeason.g || 1)).toFixed(1)}</div>
                              <div>APG: {((currentSeason.ast || 0) / (currentSeason.gp || currentSeason.g || 1)).toFixed(1)}</div>
                              <div>FG%: {((currentSeason.fgp || currentSeason.fg_pct || 0) * 100).toFixed(1)}%</div>
                              <div>3P%: {((currentSeason.tpp || currentSeason.tp_pct || 0) * 100).toFixed(1)}%</div>
                              <div>FT%: {((currentSeason.ftp || currentSeason.ft_pct || 0) * 100).toFixed(1)}%</div>
                              <div>TS%: {((currentSeason.tsp || currentSeason.ts_pct || 0) * 100).toFixed(1)}%</div>
                              <div>PER: {(currentSeason.per || 0).toFixed(1)}</div>
                              <div>WS: {(currentSeason.ws || 0).toFixed(1)}</div>
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold text-white mb-1">Career</div>
                            <div className="grid grid-cols-5 gap-1 text-xs">
                              <div>MPG: {validSeasons.length > 0 ? (validSeasons.reduce((sum: number, s: any) => sum + ((s.mp || 0) / (s.gp || s.g || 1)), 0) / validSeasons.length).toFixed(1) : "0.0"}</div>
                              <div>PPG: {validSeasons.length > 0 ? (validSeasons.reduce((sum: number, s: any) => sum + ((s.pts || 0) / (s.gp || s.g || 1)), 0) / validSeasons.length).toFixed(1) : "0.0"}</div>
                              <div>RPG: {validSeasons.length > 0 ? (validSeasons.reduce((sum: number, s: any) => sum + ((s.trb || 0) / (s.gp || s.g || 1)), 0) / validSeasons.length).toFixed(1) : "0.0"}</div>
                              <div>APG: {validSeasons.length > 0 ? (validSeasons.reduce((sum: number, s: any) => sum + ((s.ast || 0) / (s.gp || s.g || 1)), 0) / validSeasons.length).toFixed(1) : "0.0"}</div>
                              <div>FG%: {validSeasons.length > 0 ? ((validSeasons.reduce((sum: number, s: any) => sum + (s.fgp || s.fg_pct || 0), 0) / validSeasons.length) * 100).toFixed(1) : "0.0"}%</div>
                              <div>3P%: {validSeasons.length > 0 ? ((validSeasons.reduce((sum: number, s: any) => sum + (s.tpp || s.tp_pct || 0), 0) / validSeasons.length) * 100).toFixed(1) : "0.0"}%</div>
                              <div>FT%: {validSeasons.length > 0 ? ((validSeasons.reduce((sum: number, s: any) => sum + (s.ftp || s.ft_pct || 0), 0) / validSeasons.length) * 100).toFixed(1) : "0.0"}%</div>
                              <div>TS%: {validSeasons.length > 0 ? ((validSeasons.reduce((sum: number, s: any) => sum + (s.tsp || s.ts_pct || 0), 0) / validSeasons.length) * 100).toFixed(1) : "0.0"}%</div>
                              <div>PER: {validSeasons.length > 0 ? (validSeasons.reduce((sum: number, s: any) => sum + (s.per || 0), 0) / validSeasons.length).toFixed(1) : "0.0"}</div>
                              <div>WS: {(player.careerWinShares || (player as any).careerWS || 0).toFixed(1)}</div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                }
              } else {
                // No game statistics available - show available data
                return (
                  <div className="space-y-3 text-sm">
                    <div className="text-center text-gray-400 py-4">
                      <div className="text-sm">Detailed game statistics not available in this export format</div>
                      <div className="text-xs mt-1">This BBGM export contains only player development ratings</div>
                      <div className="text-xs mt-1">For full statistics, use a BBGM export that includes compiled season stats</div>
                    </div>
                    
                    <div>
                      <div className="font-semibold text-white mb-1">Career Summary</div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>Seasons: {player.stats?.length || 0}</div>
                        <div>Peak OVR: {player.stats ? Math.max(...player.stats.map((s: any) => s.ovr || 0)) : 0}</div>
                        <div>Position: {player.stats?.[player.stats.length - 1]?.pos || 'N/A'}</div>
                        <div>Win Shares: {player.careerWinShares || 0}</div>
                        <div>Quality: {player.quality || 50}</div>
                        <div>Status: {player.achievements?.includes("Retired") ? "Retired" : "Active"}</div>
                      </div>
                    </div>
                  </div>
                );
              }
            })()}
          </div>

          {/* Awards Section */}
          {player.achievements && player.achievements.length > 0 && (
            <div className="bg-slate-700 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-300 mb-2">Awards</h3>
              <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                {(() => {
                  // Filter out generic statistical achievements and only show actual awards
                  const awardsToShow = player.achievements.filter((achievement: string) => {
                    const statisticalAchievements = [
                      "20000+ Points", "5000+ Assists", "20+ Points Per Game", 
                      "5+ Assists Per Game", "1+ Block Per Game", "1+ Steal Per Game",
                      "First Round Draft Pick", "Born Outside US 50 States and DC",
                      "Retired"  // Status, not an award
                    ];
                    return !statisticalAchievements.includes(achievement);
                  });
                  
                  if (awardsToShow.length === 0) {
                    return <div className="text-gray-400 text-xs">No awards available in this export</div>;
                  }
                  
                  return awardsToShow.map((achievement: string, idx: number) => (
                    <div key={idx}>{achievement}</div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}