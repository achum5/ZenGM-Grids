import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Player, TeamInfo } from "@shared/schema";

interface PlayerCellInfoProps {
  playerName: string;
  isCorrect: boolean;
  rarity: number;
  cellCriteria?: { row: string; column: string };
  candidateCount?: number;
  teamData?: TeamInfo[];
}

// Team abbreviations mapping
const teamAbbreviations: { [key: string]: string } = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS", 
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOL",
  // Custom team mapping for uploaded league files  
  "Columbus Crush": "CLB",
  "St. Louis Spirit": "STL",
  "Sacramento Royalty": "SAC",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
  
  // Historical/Relocated Teams
  "Seattle SuperSonics": "SEA",
  "New Jersey Nets": "NJN",
  "Charlotte Bobcats": "CHA",
  "New Orleans Hornets": "NOH",
  "Vancouver Grizzlies": "VAN",
  "Kansas City Kings": "KCK",
  "San Diego Clippers": "SDC",
  "Buffalo Braves": "BUF",
  "St. Louis Spirits": "STL",
  "Washington Bullets": "WAS",
  "Capital Bullets": "CAP",
  "Baltimore Bullets": "BAL"
};

function getTeamAbbr(teamName: string, teamData?: TeamInfo[]): string {
  // First check if we have authentic team data from uploaded file
  if (teamData) {
    const teamInfo = teamData.find(t => t.name === teamName);
    if (teamInfo?.abbrev) {
      return teamInfo.abbrev;
    }
  }
  
  // Fallback to comprehensive mapping, then generate from first 3 letters
  return teamAbbreviations[teamName] || teamName.substring(0, 3).toUpperCase();
}

export function PlayerCellInfo({ playerName, isCorrect, rarity, cellCriteria, candidateCount, teamData }: PlayerCellInfoProps) {
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
        <div className="text-sm font-bold text-white mb-1 leading-tight">
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
  
  // Format all teams with years - show each team stint separately
  const allTeamsFormatted = player.years?.map(y => 
    `${getTeamAbbr(y.team, teamData)} (${y.start}–${y.end})`
  ).join(', ') || player.teams.map(team => getTeamAbbr(team, teamData)).join(', ');

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
        <div className="text-sm font-bold text-white mb-1 leading-tight">{playerName}</div>
        {/* Show ALL teams for incorrect answers too */}
        {player.years && player.years.length > 0 ? (
          <div 
            className="text-xs text-white font-medium leading-tight px-1 text-center flex-1 overflow-y-auto overscroll-contain flex flex-col justify-center"
            style={{ pointerEvents: 'auto', scrollBehavior: 'auto' }}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="break-words space-y-0.5">
              {player.years.map((teamYear, idx) => (
                <div key={`${teamYear.team}-${teamYear.start}`} className="block">
                  {getTeamAbbr(teamYear.team, teamData)} ({teamYear.start === teamYear.end ? teamYear.start : `${teamYear.start}–${teamYear.end}`})
                </div>
              ))}
            </div>
          </div>
        ) : primaryTeam && (
          <div className="text-xs text-white font-medium mb-1 px-1 text-center break-words">
            {getTeamAbbr(primaryTeam, teamData)} {yearRange && `(${yearRange})`}
          </div>
        )}
        <div className="text-xs text-red-300 font-bold mt-1">✗ Wrong</div>
      </div>
    );
  }

  if (showExpanded) {
    return (
      <div 
        className="w-full h-full bg-slate-900 p-2 text-white text-xs leading-tight cursor-pointer overflow-y-auto overscroll-contain"
        onClick={() => setShowExpanded(false)}
        onWheel={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto', scrollBehavior: 'auto' }}
      >
        {/* Identity */}
        <div className="font-semibold text-center mb-2">
          {playerName}
        </div>
        
        {/* All Teams */}
        <div className="text-center mb-2 text-blue-300 text-xs leading-relaxed">
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-1">
            {player.years?.map((teamYear, idx) => (
              <span key={`${teamYear.team}-${teamYear.start}`} className="whitespace-nowrap">
                {getTeamAbbr(teamYear.team, teamData)} ({teamYear.start === teamYear.end ? teamYear.start : `${teamYear.start}–${teamYear.end}`})
                {idx < (player.years?.length || 0) - 1 && ','}
              </span>
            )) || player.teams.map((team, idx) => (
              <span key={team} className="whitespace-nowrap">
                {getTeamAbbr(team, teamData)}
                {idx < player.teams.length - 1 && ','}
              </span>
            ))}
          </div>
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
      className="w-full h-full flex flex-col items-center justify-center text-center p-1 cursor-pointer overflow-hidden"
      onClick={() => setShowExpanded(true)}
    >
      {/* Player name */}
      <div className="text-sm font-bold text-white mb-1 leading-tight px-1 break-words hyphens-auto">
        {playerName}
      </div>
      
      {/* Show ALL teams - prioritize this over other info */}
      {player.years && player.years.length > 0 ? (
        <div className="text-xs text-white font-medium leading-tight px-1 text-center flex-1 overflow-y-auto flex flex-col justify-center">
          <div className="break-words space-y-0.5">
            {player.years.map((teamYear, idx) => (
              <div key={`${teamYear.team}-${teamYear.start}`} className="block">
                {getTeamAbbr(teamYear.team)} ({teamYear.start === teamYear.end ? teamYear.start : `${teamYear.start}–${teamYear.end}`})
              </div>
            ))}
          </div>
        </div>
      ) : primaryTeam && (
        <div className="text-xs text-white font-medium mb-1 px-1 text-center break-words">
          {getTeamAbbr(primaryTeam)} {yearRange && `(${yearRange})`}
        </div>
      )}
      
      {/* Minimal status info */}
      <div className="text-xs text-green-300 font-bold mt-1">
        ✓ Correct
      </div>
    </div>
  );
}