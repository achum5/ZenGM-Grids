import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Player } from "@shared/schema";

interface PlayerCellInfoProps {
  playerName: string;
  isCorrect: boolean;
  rarity: number;
  cellCriteria?: { row: string; column: string };
  candidateCount?: number;
}

export function PlayerCellInfo({ playerName, isCorrect, rarity, cellCriteria, candidateCount }: PlayerCellInfoProps) {
  const [showExpanded, setShowExpanded] = useState(false);
  
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

  // Calculate career stats from BBGM data
  let careerStats = { ppg: 0, rpg: 0, apg: 0, ws: 0, bpm: 0, games: 0, seasons: 0 };
  let peakSeason = { season: '', ws48: 0, ovr: 0, ppg: 0, rpg: 0, apg: 0 };
  
  if (player.stats && Array.isArray(player.stats)) {
    let totalPoints = 0, totalReb = 0, totalAst = 0, totalWS = 0, totalBPM = 0, totalGames = 0;
    let bestWS48 = 0, bestSeason = '';
    
    player.stats.forEach((season: any) => {
      const gp = season.gp || 0;
      const pts = season.pts || 0;
      const trb = season.trb || 0;
      const ast = season.ast || 0;
      const ws = season.ws || 0;
      const bpm = season.bpm || 0;
      const ws48 = season.ws48 || (gp > 0 ? ws / gp * 48 : 0);
      
      totalPoints += pts * gp;
      totalReb += trb * gp;
      totalAst += ast * gp;
      totalWS += ws;
      totalBPM += bpm * gp;
      totalGames += gp;
      
      if (ws48 > bestWS48 && gp > 20) {
        bestWS48 = ws48;
        bestSeason = season.season?.toString() || '';
        peakSeason = {
          season: bestSeason,
          ws48: ws48,
          ovr: season.ovr || 0,
          ppg: pts,
          rpg: trb,
          apg: ast
        };
      }
    });
    
    if (totalGames > 0) {
      careerStats = {
        ppg: Math.round((totalPoints / totalGames) * 10) / 10,
        rpg: Math.round((totalReb / totalGames) * 10) / 10,
        apg: Math.round((totalAst / totalGames) * 10) / 10,
        ws: Math.round(totalWS),
        bpm: Math.round((totalBPM / totalGames) * 10) / 10,
        games: totalGames,
        seasons: player.stats.length
      };
    }
  }

  // Get primary team for this cell context
  const primaryTeam = cellCriteria ? 
    (player.teams.includes(cellCriteria.column) ? cellCriteria.column : 
     player.teams.includes(cellCriteria.row) ? cellCriteria.row : 
     player.teams[0]) : player.teams[0];
     
  // Get years with primary team
  const teamYears = player.years?.find(y => y.team === primaryTeam);
  const yearRange = teamYears ? `${teamYears.start}–${teamYears.end}` : '';

  // Count major accolades
  const accolades = {
    mvp: player.achievements?.filter(a => a === "MVP").length || 0,
    fmvp: player.achievements?.filter(a => a === "Finals MVP").length || 0,
    allStar: player.achievements?.filter(a => a === "All Star").length || 0,
    champ: player.achievements?.filter(a => a === "League Champ").length || 0,
    dpoy: player.achievements?.filter(a => a === "Defensive Player of the Year").length || 0,
    roy: player.achievements?.filter(a => a === "Rookie of the Year").length || 0
  };

  // Format accolades string
  const accoladeItems = [];
  if (accolades.mvp > 0) accoladeItems.push(`${accolades.mvp}× MVP`);
  if (accolades.fmvp > 0) accoladeItems.push(`${accolades.fmvp}× FMVP`);
  if (accolades.allStar > 0) accoladeItems.push(`${accolades.allStar}× AS`);
  if (accolades.champ > 0) accoladeItems.push(`${accolades.champ}× Champ`);
  if (accolades.dpoy > 0) accoladeItems.push(`${accolades.dpoy}× DPOY`);
  if (accolades.roy > 0) accoladeItems.push(`ROY`);
  
  const accoladesStr = accoladeItems.slice(0, 4).join(' • ');

  if (!isCorrect) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-1">
        <div className="text-xs font-semibold text-white mb-1 leading-tight">{playerName}</div>
        <div className="text-xs text-red-300 opacity-80">X</div>
      </div>
    );
  }

  if (showExpanded) {
    return (
      <div 
        className="w-full h-full bg-slate-900 p-2 text-white text-xs leading-tight cursor-pointer overflow-y-auto"
        onClick={() => setShowExpanded(false)}
      >
        {/* Identity */}
        <div className="font-semibold text-center mb-1">
          {playerName} — {primaryTeam} {yearRange && `(${yearRange})`}
        </div>
        
        {/* Criteria badges */}
        <div className="text-center mb-1 text-blue-300">
          {cellCriteria && (
            <div>
              {cellCriteria.column} × {cellCriteria.row} ✓
            </div>
          )}
        </div>
        
        {/* Quality & Rarity */}
        <div className="text-center mb-1 text-yellow-300">
          Quality {player.quality || 50} • Rarity {rarity}% • {candidateCount || 0} candidates
        </div>
        
        {/* Career stats */}
        <div className="text-center mb-1">
          Career: {careerStats.ppg} / {careerStats.rpg} / {careerStats.apg} • WS {careerStats.ws} • BPM {careerStats.bpm}
        </div>
        
        {/* Peak season */}
        {peakSeason.season && (
          <div className="text-center mb-1">
            Peak: {peakSeason.season} — WS/48 {peakSeason.ws48.toFixed(3)}
          </div>
        )}
        
        {/* Accolades */}
        {accoladesStr && (
          <div className="text-center text-green-300">
            {accoladesStr}
          </div>
        )}
      </div>
    );
  }

  // Compact view
  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-center text-center p-1 cursor-pointer"
      onClick={() => setShowExpanded(true)}
    >
      {/* Player name */}
      <div className="text-xs font-semibold text-white mb-1 leading-tight">
        {playerName}
      </div>
      
      {/* Primary team */}
      <div className="text-xs text-blue-300 opacity-90 mb-1">
        {primaryTeam}
      </div>
      
      {/* Career highlight */}
      <div className="text-xs text-gray-300 opacity-80 mb-1">
        {careerStats.ppg} / {careerStats.rpg} / {careerStats.apg}
      </div>
      
      {/* Quality and rarity */}
      <div className="text-xs text-yellow-300 opacity-90">
        Q{player.quality || 50} • {rarity}%
      </div>
    </div>
  );
}