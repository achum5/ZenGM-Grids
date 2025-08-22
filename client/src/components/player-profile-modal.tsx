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
}

// Calculate career stats from BBGM data
function calculateCareerStats(statsData: any) {
  if (!statsData) return null;
  
  let stats: any[] = [];
  
  // Handle both array format and single season object
  if (Array.isArray(statsData)) {
    stats = statsData;
  } else if (typeof statsData === 'object') {
    // If it's a single object, wrap it in an array
    stats = [statsData];
  } else {
    return null;
  }
  
  if (stats.length === 0) return null;
  
  // Calculate career totals and averages
  let totalGames = 0;
  let totalPoints = 0;
  let totalRebounds = 0;
  let totalAssists = 0;
  let totalBlocks = 0;
  let totalSteals = 0;
  let totalFGMade = 0;
  let totalFGAttempted = 0;
  let totalFTMade = 0;
  let totalFTAttempted = 0;
  let seasonsPlayed = 0;
  
  stats.forEach((season: any) => {
    // Skip seasons with no games played
    const games = season.gp || season.games || 0;
    if (games === 0) return;
    
    seasonsPlayed++;
    totalGames += games;
    
    // Points calculation - try multiple formats
    let seasonPoints = 0;
    if (season.pts !== undefined) {
      seasonPoints = season.pts * games;
    } else if (season.ppg !== undefined) {
      seasonPoints = season.ppg * games;
    } else if (season.fg !== undefined && season.tp !== undefined && season.ft !== undefined) {
      // Calculate from BBGM attributes (simplified estimation)
      const estimatedPPG = (season.fg + season.tp * 0.4 + season.ft * 0.6) / 10;
      seasonPoints = estimatedPPG * games;
    }
    totalPoints += seasonPoints;
    
    // Rebounds
    let seasonRebounds = 0;
    if (season.reb !== undefined) {
      seasonRebounds = season.reb * games;
    } else if (season.rpg !== undefined) {
      seasonRebounds = season.rpg * games;
    } else if (season.drb !== undefined) {
      // Use defensive rebounding attribute as estimate
      const estimatedRPG = season.drb / 8;
      seasonRebounds = estimatedRPG * games;
    }
    totalRebounds += seasonRebounds;
    
    // Assists
    let seasonAssists = 0;
    if (season.ast !== undefined) {
      seasonAssists = season.ast * games;
    } else if (season.apg !== undefined) {
      seasonAssists = season.apg * games;
    } else if (season.pss !== undefined) {
      // Use passing attribute as estimate
      const estimatedAPG = season.pss / 15;
      seasonAssists = estimatedAPG * games;
    }
    totalAssists += seasonAssists;
    
    // Blocks
    let seasonBlocks = 0;
    if (season.blk !== undefined) {
      seasonBlocks = season.blk * games;
    } else if (season.bpg !== undefined) {
      seasonBlocks = season.bpg * games;
    }
    totalBlocks += seasonBlocks;
    
    // Steals
    let seasonSteals = 0;
    if (season.stl !== undefined) {
      seasonSteals = season.stl * games;
    } else if (season.spg !== undefined) {
      seasonSteals = season.spg * games;
    }
    totalSteals += seasonSteals;
    
    // Field Goals
    if (season.fgm !== undefined && season.fga !== undefined) {
      totalFGMade += season.fgm * games;
      totalFGAttempted += season.fga * games;
    } else if (season.fg_pct !== undefined && season.fga !== undefined) {
      totalFGMade += (season.fg_pct * season.fga) * games;
      totalFGAttempted += season.fga * games;
    }
    
    // Free Throws
    if (season.ftm !== undefined && season.fta !== undefined) {
      totalFTMade += season.ftm * games;
      totalFTAttempted += season.fta * games;
    } else if (season.ft_pct !== undefined && season.fta !== undefined) {
      totalFTMade += (season.ft_pct * season.fta) * games;
      totalFTAttempted += season.fta * games;
    }
  });
  
  if (totalGames === 0) return null;
  
  // Calculate percentages
  const fgPercentage = totalFGAttempted > 0 ? (totalFGMade / totalFGAttempted) * 100 : 0;
  const ftPercentage = totalFTAttempted > 0 ? (totalFTMade / totalFTAttempted) * 100 : 0;
  
  return {
    // Career averages
    averages: {
      points: totalPoints / totalGames,
      rebounds: totalRebounds / totalGames,
      assists: totalAssists / totalGames,
      blocks: totalBlocks / totalGames,
      steals: totalSteals / totalGames,
      fgPercentage: fgPercentage,
      ftPercentage: ftPercentage
    },
    // Career totals
    totals: {
      points: Math.round(totalPoints),
      rebounds: Math.round(totalRebounds),
      assists: Math.round(totalAssists),
      blocks: Math.round(totalBlocks),
      steals: Math.round(totalSteals),
      games: totalGames,
      seasons: seasonsPlayed
    }
  };
}

export function PlayerProfileModal({ player, open, onOpenChange, columnCriteria, rowCriteria }: PlayerProfileModalProps) {
  if (!player) return null;

  // Calculate career stats
  const careerStats = calculateCareerStats(player.stats);

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
        className="max-w-md mx-auto bg-slate-800 border-slate-700"
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

          {/* Career Stats Section */}
          {careerStats ? (
            <div className="bg-slate-700 rounded-lg p-4">
              <h3 className="font-semibold text-green-300 mb-3">Career Stats</h3>
              
              {/* Career Averages */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-blue-200 mb-2">Career Averages</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Points:</span>
                    <span className="text-white font-medium">{careerStats.averages.points.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Rebounds:</span>
                    <span className="text-white font-medium">{careerStats.averages.rebounds.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Assists:</span>
                    <span className="text-white font-medium">{careerStats.averages.assists.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Blocks:</span>
                    <span className="text-white font-medium">{careerStats.averages.blocks.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Steals:</span>
                    <span className="text-white font-medium">{careerStats.averages.steals.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">FG%:</span>
                    <span className="text-white font-medium">
                      {careerStats.averages.fgPercentage > 0 ? `${careerStats.averages.fgPercentage.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">FT%:</span>
                    <span className="text-white font-medium">
                      {careerStats.averages.ftPercentage > 0 ? `${careerStats.averages.ftPercentage.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Career Totals */}
              <div>
                <h4 className="text-sm font-medium text-orange-200 mb-2">Career Totals</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Points:</span>
                    <span className="text-white font-medium">{careerStats.totals.points.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Rebounds:</span>
                    <span className="text-white font-medium">{careerStats.totals.rebounds.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Assists:</span>
                    <span className="text-white font-medium">{careerStats.totals.assists.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Blocks:</span>
                    <span className="text-white font-medium">{careerStats.totals.blocks.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Steals:</span>
                    <span className="text-white font-medium">{careerStats.totals.steals.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Games:</span>
                    <span className="text-white font-medium">{careerStats.totals.games.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Seasons:</span>
                    <span className="text-white font-medium">{careerStats.totals.seasons}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-700 rounded-lg p-4">
              <h3 className="font-semibold text-green-300 mb-2">Career Stats</h3>
              <div className="text-sm text-gray-400">
                No statistical data available
              </div>
            </div>
          )}

          {/* Other Top Answers Section */}
          <div className="bg-slate-700 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-300 mb-2">Other Top Answers</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {topPlayers && topPlayers.length > 0 ? (
                topPlayers.map((topPlayer, idx) => (
                  <div key={topPlayer.name} className="text-sm truncate">
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