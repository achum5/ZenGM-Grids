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

  // Extract career stats from BBGM data - show simplified player info
  let careerStats = { ppg: 0, rpg: 0, apg: 0, seasons: 0 };
  let peakSeason = { season: '', ovr: 0, ppg: 0, rpg: 0, apg: 0 };
  
  if (player.stats && Array.isArray(player.stats)) {
    let bestOvr = 0;
    let totalSeasons = player.stats.length;
    
    // Find peak season by overall rating
    player.stats.forEach((season: any) => {
      const ovr = season.ovr || 0;
      
      if (ovr > bestOvr) {
        bestOvr = ovr;
        peakSeason = {
          season: season.season?.toString() || '',
          ovr: ovr,
          ppg: 0, // Will estimate from attributes
          rpg: 0,
          apg: 0
        };
      }
    });
    
    // Use peak overall rating as main indicator instead of calculated stats
    if (totalSeasons > 0) {
      careerStats = {
        ppg: 0, // Not calculating complex stats
        rpg: 0,
        apg: 0,
        seasons: totalSeasons
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
      <div 
        className="w-full h-full flex flex-col items-center justify-center text-center p-1 cursor-pointer"
        onClick={() => setShowExpanded(true)}
      >
        <div className="text-xs font-semibold text-white mb-1 leading-tight">{playerName}</div>
        {/* Show team info even for incorrect answers */}
        {primaryTeam && (
          <div className="text-xs text-blue-300 opacity-70 mb-1">
            {primaryTeam} {yearRange && `(${yearRange})`}
          </div>
        )}
        <div className="text-xs text-red-300 opacity-80">✗ Wrong</div>
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
        
        {/* Candidate count */}
        <div className="text-center mb-1 text-yellow-300">
          {candidateCount || 0} valid answers for this cell
        </div>
        
        {/* Career info */}
        <div className="text-center mb-1">
          Career: {careerStats.seasons} seasons • Peak {peakSeason.ovr} OVR ({peakSeason.season})
        </div>
        
        {/* Peak season */}
        {peakSeason.season && (
          <div className="text-center mb-1">
            Peak: {peakSeason.season} — {peakSeason.ovr} OVR ({peakSeason.ppg}/{peakSeason.rpg}/{peakSeason.apg})
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
      
      {/* Primary team with years */}
      {primaryTeam && (
        <div className="text-xs text-blue-300 opacity-90 mb-1">
          {primaryTeam} {yearRange && `(${yearRange})`}
        </div>
      )}
      
      {/* Career info */}
      {careerStats.seasons > 0 ? (
        <div className="text-xs text-gray-300 opacity-80 mb-1">
          {careerStats.seasons} seasons • Peak {peakSeason.ovr} OVR
        </div>
      ) : player.achievements && player.achievements.length > 0 ? (
        <div className="text-xs text-gray-300 opacity-80 mb-1">
          {player.achievements.slice(0, 2).join(", ")}
        </div>
      ) : (
        <div className="text-xs text-gray-300 opacity-80 mb-1">
          Player
        </div>
      )}
      
      {/* Simple info */}
      <div className="text-xs text-green-300 opacity-90">
        ✓ Correct
      </div>
    </div>
  );
}