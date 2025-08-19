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
              console.log('Full player object:', player);
              
              // Check for actual game statistics in various possible locations
              const hasGameStats = !!(
                (player as any).careerStats || 
                (player as any).statsArray || 
                (player as any).regularStats ||
                (player as any).careerMinutes ||
                (player as any).careerWS ||
                (player as any).careerBPM_weighted ||
                (player as any).peakWS48
              );
              
              const isRetired = player.achievements?.includes("Retired");
              
              if (hasGameStats || (player as any).careerMinutes !== undefined) {
                // Show actual BBGM game statistics
                const p = player as any;
                return (
                  <div className="space-y-3 text-sm">
                    {isRetired ? (
                      <>
                        <div>
                          <div className="font-semibold text-white mb-1">Peak Season</div>
                          <div className="grid grid-cols-5 gap-1 text-xs">
                            <div>MPG: {(p.peakMPG || 0).toFixed(1)}</div>
                            <div>PPG: {(p.peakPPG || 0).toFixed(1)}</div>
                            <div>RPG: {(p.peakRPG || 0).toFixed(1)}</div>
                            <div>APG: {(p.peakAPG || 0).toFixed(1)}</div>
                            <div>FG%: {((p.peakFGP || 0) * 100).toFixed(1)}%</div>
                            <div>3P%: {((p.peak3PP || 0) * 100).toFixed(1)}%</div>
                            <div>FT%: {((p.peakFTP || 0) * 100).toFixed(1)}%</div>
                            <div>TS%: {((p.peakTSP || 0) * 100).toFixed(1)}%</div>
                            <div>PER: {(p.peakPER || 0).toFixed(1)}</div>
                            <div>WS: {(p.peakWS || 0).toFixed(1)}</div>
                          </div>
                        </div>
                        <div>
                          <div className="font-semibold text-white mb-1">Career</div>
                          <div className="grid grid-cols-5 gap-1 text-xs">
                            <div>MPG: {(p.careerMPG || 0).toFixed(1)}</div>
                            <div>PPG: {(p.careerPPG || 0).toFixed(1)}</div>
                            <div>RPG: {(p.careerRPG || 0).toFixed(1)}</div>
                            <div>APG: {(p.careerAPG || 0).toFixed(1)}</div>
                            <div>FG%: {((p.careerFGP || 0) * 100).toFixed(1)}%</div>
                            <div>3P%: {((p.career3PP || 0) * 100).toFixed(1)}%</div>
                            <div>FT%: {((p.careerFTP || 0) * 100).toFixed(1)}%</div>
                            <div>TS%: {((p.careerTSP || 0) * 100).toFixed(1)}%</div>
                            <div>PER: {(p.careerPER || 0).toFixed(1)}</div>
                            <div>WS: {(p.careerWinShares || p.careerWS || 0).toFixed(1)}</div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <div className="font-semibold text-white mb-1">Current Season</div>
                          <div className="grid grid-cols-5 gap-1 text-xs">
                            <div>MPG: {(p.currentMPG || 0).toFixed(1)}</div>
                            <div>PPG: {(p.currentPPG || 0).toFixed(1)}</div>
                            <div>RPG: {(p.currentRPG || 0).toFixed(1)}</div>
                            <div>APG: {(p.currentAPG || 0).toFixed(1)}</div>
                            <div>FG%: {((p.currentFGP || 0) * 100).toFixed(1)}%</div>
                            <div>3P%: {((p.current3PP || 0) * 100).toFixed(1)}%</div>
                            <div>FT%: {((p.currentFTP || 0) * 100).toFixed(1)}%</div>
                            <div>TS%: {((p.currentTSP || 0) * 100).toFixed(1)}%</div>
                            <div>PER: {(p.currentPER || 0).toFixed(1)}</div>
                            <div>WS: {(p.currentWS || 0).toFixed(1)}</div>
                          </div>
                        </div>
                        <div>
                          <div className="font-semibold text-white mb-1">Career</div>
                          <div className="grid grid-cols-5 gap-1 text-xs">
                            <div>MPG: {(p.careerMPG || 0).toFixed(1)}</div>
                            <div>PPG: {(p.careerPPG || 0).toFixed(1)}</div>
                            <div>RPG: {(p.careerRPG || 0).toFixed(1)}</div>
                            <div>APG: {(p.careerAPG || 0).toFixed(1)}</div>
                            <div>FG%: {((p.careerFGP || 0) * 100).toFixed(1)}%</div>
                            <div>3P%: {((p.career3PP || 0) * 100).toFixed(1)}%</div>
                            <div>FT%: {((p.careerFTP || 0) * 100).toFixed(1)}%</div>
                            <div>TS%: {((p.careerTSP || 0) * 100).toFixed(1)}%</div>
                            <div>PER: {(p.careerPER || 0).toFixed(1)}</div>
                            <div>WS: {(p.careerWinShares || p.careerWS || 0).toFixed(1)}</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              } else {
                // Fallback to development info if no game stats
                return (
                  <div className="space-y-3 text-sm">
                    <div className="text-center text-gray-400 py-4">
                      <div className="text-sm">Game statistics not available in this export</div>
                      <div className="text-xs mt-1">Only player ratings progression is included</div>
                    </div>
                    
                    <div>
                      <div className="font-semibold text-white mb-1">Career Development</div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>Seasons: {player.stats?.length || 0}</div>
                        <div>Peak OVR: {player.stats ? Math.max(...player.stats.map((s: any) => s.ovr || 0)) : 0}</div>
                        <div>Position: {player.stats?.[player.stats.length - 1]?.pos || 'N/A'}</div>
                        <div>Win Shares: {player.careerWinShares || 0}</div>
                        <div>Quality: {player.quality || 50}</div>
                        <div>Status: {isRetired ? "Retired" : "Active"}</div>
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
                  // Filter out generic achievements and only show specific awards
                  const awardsToShow = player.achievements.filter((achievement: string) => {
                    const genericAchievements = [
                      "20000+ Points", "5000+ Assists", "20+ Points Per Game", 
                      "5+ Assists Per Game", "1+ Block Per Game", "1+ Steal Per Game",
                      "First Round Draft Pick"
                    ];
                    return !genericAchievements.includes(achievement);
                  });
                  
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