import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
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
  fontSize: number;
}

// Font size cache to avoid repeated calculations
const fontSizeCache = new Map<string, number>();

function getFontSizeForText(
  text: string,
  availableWidth: number,
  availableHeight: number,
  isMultiline: boolean,
  minFont: number,
  maxFont: number
): number {
  const cacheKey = `${text}-${availableWidth}-${availableHeight}-${isMultiline}-${minFont}-${maxFont}`;
  if (fontSizeCache.has(cacheKey)) {
    return fontSizeCache.get(cacheKey)!;
  }

  // Create temporary canvas for accurate text measurement
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Binary search for the largest font that fits
  let low = minFont;
  let high = maxFont;
  let bestFit = minFont;

  while (low <= high) {
    const fontSize = Math.floor((low + high) / 2);
    ctx.font = `bold ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
    
    let totalWidth = 0;
    let totalHeight = fontSize * (isMultiline ? 2.2 : 1.2); // Line height factor

    if (isMultiline) {
      const lines = text.split('\n');
      totalWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    } else {
      totalWidth = ctx.measureText(text).width;
    }

    if (totalWidth <= availableWidth && totalHeight <= availableHeight) {
      bestFit = fontSize;
      low = fontSize + 1;
    } else {
      high = fontSize - 1;
    }
  }

  fontSizeCache.set(cacheKey, bestFit);
  return bestFit;
}

function formatPlayerNameWithAutoFit(
  fullName: string, 
  containerWidth: number, 
  containerHeight: number
): NameFitResult {
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length === 0) return { mode: 'minimal', lines: [''], fontSize: 11 };
  
  const firstName = nameParts[0];
  const firstInitial = firstName.charAt(0) + '.';
  const lastNameFull = nameParts.slice(1).join(' ');
  
  // Define name band dimensions (bottom 24-30% of tile)
  const nameBandHeight = Math.max(24, Math.min(containerHeight * 0.3, 40));
  const nameBandWidth = containerWidth * 0.9; // Leave some padding
  
  // Font size bounds
  const minFont = 11;
  const maxFontOneLine = Math.max(minFont, Math.min(containerWidth * 0.07, 20));
  const maxFontTwoLine = Math.max(minFont, Math.min(containerWidth * 0.06, 18));

  // Try fitting modes in order with auto-sizing
  
  // 1. One-line full: "F. Lastname"
  const oneLineFull = `${firstInitial} ${lastNameFull}`;
  const oneLineFullFont = getFontSizeForText(
    oneLineFull, 
    nameBandWidth, 
    nameBandHeight, 
    false, 
    minFont, 
    maxFontOneLine
  );
  
  if (oneLineFullFont > minFont) {
    return { 
      mode: 'one-line-full', 
      lines: [oneLineFull], 
      fontSize: oneLineFullFont 
    };
  }
  
  // 2. Two-line full: "F." on line 1, "Lastname" on line 2
  const twoLineFull = `${firstInitial}\n${lastNameFull}`;
  const twoLineFullFont = getFontSizeForText(
    twoLineFull, 
    nameBandWidth, 
    nameBandHeight, 
    true, 
    minFont, 
    maxFontTwoLine
  );
  
  if (twoLineFullFont > minFont) {
    return { 
      mode: 'two-line-full', 
      lines: [firstInitial, lastNameFull], 
      fontSize: twoLineFullFont 
    };
  }
  
  // 3. One-line truncated: "F. Lastna..."
  // Try progressively shorter truncations
  for (let chars = lastNameFull.length - 1; chars >= 3; chars--) {
    const truncatedLastName = lastNameFull.substring(0, chars) + '...';
    const oneLineTruncated = `${firstInitial} ${truncatedLastName}`;
    const oneLineTruncatedFont = getFontSizeForText(
      oneLineTruncated, 
      nameBandWidth, 
      nameBandHeight, 
      false, 
      minFont, 
      maxFontOneLine
    );
    
    if (oneLineTruncatedFont >= minFont) {
      return { 
        mode: 'one-line-truncated', 
        lines: [oneLineTruncated], 
        fontSize: oneLineTruncatedFont 
      };
    }
  }
  
  // 4. Two-line truncated: "F." on line 1, "Lastna..." on line 2
  for (let chars = lastNameFull.length - 1; chars >= 3; chars--) {
    const truncatedLastName = lastNameFull.substring(0, chars) + '...';
    const twoLineTruncated = `${firstInitial}\n${truncatedLastName}`;
    const twoLineTruncatedFont = getFontSizeForText(
      twoLineTruncated, 
      nameBandWidth, 
      nameBandHeight, 
      true, 
      minFont, 
      maxFontTwoLine
    );
    
    if (twoLineTruncatedFont >= minFont) {
      return { 
        mode: 'two-line-truncated', 
        lines: [firstInitial, truncatedLastName], 
        fontSize: twoLineTruncatedFont 
      };
    }
  }
  
  // 5. Minimal fallback: just "F."
  const minimalFont = getFontSizeForText(
    firstInitial, 
    nameBandWidth, 
    nameBandHeight, 
    false, 
    minFont, 
    maxFontOneLine
  );
  
  return { 
    mode: 'minimal', 
    lines: [firstInitial], 
    fontSize: Math.max(minimalFont, minFont) 
  };
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
  const [nameFormat, setNameFormat] = useState<NameFitResult>({ 
    mode: 'minimal', 
    lines: [''], 
    fontSize: 11 
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  
  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ["/api/players/search", playerName],
    queryFn: async () => {
      const response = await fetch(`/api/players/search?q=${encodeURIComponent(playerName)}`);
      return response.json();
    },
  });

  const player = players.find(p => p.name === playerName);

  // Debounced name fitting function
  const updateNameFormat = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      if (containerSize.width > 0 && containerSize.height > 0) {
        requestAnimationFrame(() => {
          const newFormat = formatPlayerNameWithAutoFit(
            playerName, 
            containerSize.width, 
            containerSize.height
          );
          setNameFormat(newFormat);
        });
      }
    }, 50); // 50ms debounce
  }, [playerName, containerSize.width, containerSize.height]);

  // Measure container size and update name format
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

    const handleResize = () => measureContainer();
    const handleOrientationChange = () => {
      // Small delay to account for orientation change animation
      setTimeout(measureContainer, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Update name format when container size or player name changes
  useEffect(() => {
    updateNameFormat();
  }, [updateNameFormat]);

  // Clear cache when player changes (ensures fresh calculations)
  useEffect(() => {
    fontSizeCache.clear();
  }, [playerName]);

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
  
  // Calculate avatar positioning to avoid badge overlap
  const avatarOffset = isCorrect ? { 
    marginTop: Math.max(4, badgeSize * 0.3), 
    marginLeft: Math.max(-8, -badgeSize * 0.2) 
  } : {};

  // Calculate name band height (24-30% of container height)
  const nameBandHeight = Math.max(24, Math.min(containerSize.height * 0.3, 40));

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
            marginBottom: `${Math.max(4, nameBandHeight * 0.2)}px`,
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
        
        {/* Player name with dynamic auto-fit */}
        <div 
          className="absolute bottom-1 left-1 right-1 bg-black bg-opacity-80 text-white text-center rounded border border-gray-600 flex flex-col items-center justify-center"
          style={{
            height: `${nameBandHeight}px`,
            padding: '2px 4px',
          }}
        >
          {nameFormat.lines.map((line, index) => (
            <div 
              key={index}
              className="font-bold"
              style={{
                fontSize: `${nameFormat.fontSize}px`,
                lineHeight: nameFormat.lines.length === 1 ? '1.2' : '1.1',
                fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
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