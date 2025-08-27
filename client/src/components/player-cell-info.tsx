import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import type { Player, TeamInfo, GridCriteria } from "@shared/schema";
import { PlayerFace } from "./player-face";
import { PlayerProfileModal } from "./player-profile-modal";
import { evaluatePlayerAnswer, type EvaluationResult } from "@shared/evaluation";

interface PlayerCellInfoProps {
  playerName: string;
  isCorrect: boolean;
  rarity: number;
  rank?: number;
  eligibleCount?: number;
  cellCriteria?: { row: string; column: string };
  candidateCount?: number;
  teamData?: TeamInfo[];
  columnCriteria?: GridCriteria;
  rowCriteria?: GridCriteria;
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
  if (teamData) {
    const teamInfo = teamData.find(t => t.name === teamName);
    if (teamInfo?.abbrev) {
      return teamInfo.abbrev;
    }
  }
  return teamAbbreviations[teamName] || teamName.substring(0, 3).toUpperCase();
}

// Function to get rarity color as a gradient from red (0) to green (100)
function getRarityColor(rarity: number): string {
  const clamped = Math.max(0, Math.min(100, rarity));
  if (clamped >= 90) return "bg-green-600";
  if (clamped >= 75) return "bg-green-500";
  if (clamped >= 60) return "bg-yellow-500";
  if (clamped >= 40) return "bg-orange-500";
  if (clamped >= 25) return "bg-red-400";
  if (clamped >= 10) return "bg-red-500";
  return "bg-red-600";
}

interface NameFitResult {
  mode: 'one-line-full' | 'two-line-full' | 'one-line-truncated' | 'two-line-truncated' | 'minimal';
  lines: string[];
}

function formatPlayerName(fullName: string, plateWidth: number, containerHeight: number): NameFitResult {
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length === 0) return { mode: 'minimal', lines: [''] };
  
  const firstName = nameParts[0];
  const firstInitial = firstName.charAt(0) + '.';
  const lastNameFull = nameParts.slice(1).join(' ');
  
  // Use wider name plate (92-96% of tile width)
  // Subtract padding from both sides (about 2% each side)
  const platePaddingPercent = 0.04; // 2% each side = 4% total
  const innerPlateWidth = plateWidth * (1 - platePaddingPercent);
  
  // Higher starting font size for wider plates
  const baseFontSize = Math.max(12, Math.min(18, plateWidth * 0.09));
  const estimateWidth = (text: string) => text.length * baseFontSize * 0.6;
  
  // Try fitting modes in order
  
  // 1. One-line full: "F. Lastname"
  const oneLineFull = `${firstInitial} ${lastNameFull}`;
  if (estimateWidth(oneLineFull) <= innerPlateWidth) {
    return { mode: 'one-line-full', lines: [oneLineFull] };
  }
  
  // 2. Two-line full: "F." on line 1, "Lastname" on line 2 (wraps only at spaces)
  if (estimateWidth(firstInitial) <= innerPlateWidth && estimateWidth(lastNameFull) <= innerPlateWidth) {
    return { mode: 'two-line-full', lines: [firstInitial, lastNameFull] };
  }
  
  // 3. One-line truncated: "F. Lastna..." (end ellipsis only)
  const availableForLastName = innerPlateWidth - estimateWidth(firstInitial + ' ');
  if (availableForLastName > estimateWidth('...')) {
    const maxLastNameChars = Math.floor(availableForLastName / (baseFontSize * 0.6)) - 3;
    if (maxLastNameChars > 0) {
      const truncatedLastName = lastNameFull.substring(0, maxLastNameChars) + '...';
      return { mode: 'one-line-truncated', lines: [`${firstInitial} ${truncatedLastName}`] };
    }
  }
  
  // 4. Two-line truncated: "F." on line 1, "Lastna..." on line 2 (end ellipsis only)
  if (estimateWidth(firstInitial) <= innerPlateWidth) {
    const maxLastNameChars = Math.floor(innerPlateWidth / (baseFontSize * 0.6)) - 3;
    if (maxLastNameChars > 0) {
      const truncatedLastName = lastNameFull.substring(0, maxLastNameChars) + '...';
      return { mode: 'two-line-truncated', lines: [firstInitial, truncatedLastName] };
    }
  }
  
  // 5. Minimal fallback: just "F."
  return { mode: 'minimal', lines: [firstInitial] };
}

export default function PlayerCellInfo({ 
  playerName, 
  isCorrect, 
  rarity, 
  rank, 
  eligibleCount, 
  cellCriteria, 
  candidateCount, 
  teamData, 
  columnCriteria, 
  rowCriteria 
}: PlayerCellInfoProps) {
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 100, height: 100 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ["/api/players/search", playerName],
    queryFn: async () => {
      const response = await fetch(`/api/players/search?q=${encodeURIComponent(playerName)}`);
      return response.json();
    },
  });

  const player = players.find(p => p.name === playerName);

  // Measure container size
  useEffect(() => {
    const measureContainer = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    measureContainer();
    
    const resizeObserver = new ResizeObserver(measureContainer);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', measureContainer);
    window.addEventListener('orientationchange', measureContainer);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', measureContainer);
      window.removeEventListener('orientationchange', measureContainer);
    };
  }, []);

  if (!player) {
    return (
      <div 
        ref={containerRef}
        className="w-full h-full flex flex-col items-center justify-center text-center relative"
      >
        <div className="text-sm font-bold text-white leading-tight">
          {playerName}
        </div>
        <div className="text-xs text-white opacity-80">
          {isCorrect ? `${rarity}%` : 'X'}
        </div>
      </div>
    );
  }

  // Calculate responsive sizes
  const badgeSize = Math.max(16, Math.min(24, containerSize.width * 0.15));
  const faceSize = Math.max(40, Math.min(80, containerSize.width * 0.6));
  
  // Name plate uses 94% of tile width (target: 92-96%)
  const plateWidth = containerSize.width * 0.94;
  const nameFormat = formatPlayerName(playerName, plateWidth, containerSize.height);
  
  // Calculate avatar positioning to avoid badge overlap
  const avatarOffset = isCorrect ? { marginTop: badgeSize * 0.3, marginLeft: -badgeSize * 0.2 } : {};

  return (
    <>
      <div 
        ref={containerRef}
        className="w-full h-full flex flex-col items-center justify-between text-center relative cursor-pointer overflow-hidden"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowProfileModal(true);
        }}
      >
        {/* Rarity badge - top-right, only for correct answers */}
        {isCorrect && (
          <div 
            className="absolute top-1 right-1 z-20"
            style={{
              width: `${badgeSize}px`,
              height: `${badgeSize}px`,
            }}
          >
            <div 
              className={`${getRarityColor(rarity)} text-white font-bold rounded flex items-center justify-center w-full h-full`}
              style={{
                fontSize: `${Math.max(8, badgeSize * 0.4)}px`,
              }}
            >
              {rarity}
            </div>
          </div>
        )}

        {/* Player Face - adjusted position for badge clearance */}
        <div 
          className="flex items-center justify-center flex-shrink-0"
          style={{
            ...avatarOffset,
            marginBottom: '8px',
          }}
        >
          <PlayerFace 
            face={player.face}
            imageUrl={player.imageUrl}
            size={faceSize}
            className="rounded-full overflow-hidden"
            teams={player.teams}
            currentTeam={player.years?.[player.years.length - 1]?.team}
          />
        </div>
        
        {/* Player name with full-width plate */}
        <div 
          className="absolute bottom-0 bg-black bg-opacity-80 text-white text-center rounded border border-gray-600 flex flex-col items-center justify-center"
          style={{
            width: `${plateWidth}px`,
            left: `${(containerSize.width - plateWidth) / 2}px`,
            bottom: `${containerSize.width * 0.03}px`, // 3% bottom margin
            padding: `4px ${plateWidth * 0.02}px`, // 2% horizontal padding
            minHeight: nameFormat.lines.length === 1 ? '24px' : '32px',
          }}
        >
          {nameFormat.lines.map((line, index) => (
            <div 
              key={index}
              className="font-bold leading-tight"
              style={{
                fontSize: `${Math.max(12, Math.min(18, plateWidth * 0.09))}px`,
                lineHeight: '1.1',
              }}
              title={playerName}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    
      <PlayerProfileModal 
        player={player}
        open={showProfileModal}
        onOpenChange={setShowProfileModal}
        columnCriteria={columnCriteria}
        rowCriteria={rowCriteria}
        rarity={rarity}
        rank={rank}
        eligibleCount={eligibleCount}
        isCorrect={isCorrect}
        evaluation={!isCorrect && columnCriteria && rowCriteria ? 
          evaluatePlayerAnswer(player, columnCriteria, rowCriteria) : 
          undefined
        }
      />
    </>
  );
}