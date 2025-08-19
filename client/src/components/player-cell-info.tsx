import { useQuery } from "@tanstack/react-query";
import type { Player } from "@shared/schema";

interface PlayerCellInfoProps {
  playerName: string;
  isCorrect: boolean;
  rarity: number;
}

export function PlayerCellInfo({ playerName, isCorrect, rarity }: PlayerCellInfoProps) {
  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ["/api/players/search", playerName],
    queryFn: async () => {
      const response = await fetch(`/api/players/search?q=${encodeURIComponent(playerName)}`);
      return response.json();
    },
  });

  const player = players.find(p => p.name === playerName);

  if (!player) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-2">
        <div className="text-xs font-semibold text-white mb-1 leading-tight">
          {playerName}
        </div>
        <div className="text-xs text-white opacity-80">
          {isCorrect ? `${rarity}%` : 'X'}
        </div>
      </div>
    );
  }

  // Extract current/latest team (last team in the list)
  const currentTeam = player.teams[player.teams.length - 1];
  
  // Get career years span
  const years = player.years || [];
  const startYear = years.length > 0 ? Math.min(...years.map(y => y.start)) : null;
  const endYear = years.length > 0 ? Math.max(...years.map(y => y.end)) : null;
  
  // Extract peak overall rating from stats
  let peakOverall = null;
  if (player.stats && Array.isArray(player.stats)) {
    const overallRatings = player.stats.map((season: any) => season.ovr).filter(Boolean);
    if (overallRatings.length > 0) {
      peakOverall = Math.max(...overallRatings);
    }
  }

  // Get notable achievements (first 2-3 most important)
  const topAchievements = player.achievements?.slice(0, 2) || [];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center p-1">
      {/* Player name */}
      <div className="text-xs font-semibold text-white mb-1 leading-tight">
        {playerName}
      </div>
      
      {/* Current team */}
      <div className="text-xs text-white opacity-75 mb-1">
        {currentTeam}
      </div>
      
      {/* Peak overall or career span */}
      {peakOverall && (
        <div className="text-xs text-yellow-300 opacity-90 mb-1">
          Peak: {peakOverall} OVR
        </div>
      )}
      
      {/* Years active */}
      {startYear && endYear && (
        <div className="text-xs text-gray-300 opacity-70 mb-1">
          {startYear}-{endYear}
        </div>
      )}
      
      {/* Top achievements */}
      {topAchievements.length > 0 && (
        <div className="text-xs text-blue-300 opacity-80 mb-1">
          {topAchievements.join(", ")}
        </div>
      )}
      
      {/* Rarity */}
      <div className="text-xs text-white opacity-80">
        {isCorrect ? `${rarity}%` : 'X'}
      </div>
    </div>
  );
}