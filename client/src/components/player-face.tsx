import { useEffect, useRef } from "react";
import { display, generate } from "facesjs";

interface PlayerFaceProps {
  face?: Record<string, any> | null;
  imageUrl?: string | null;
  size?: number;
  className?: string;
  teams?: string[];
  currentTeam?: string;
}

// Team color mapping for BBGM teams
const TEAM_COLORS: Record<string, string[]> = {
  "Atlanta Hawks": ["#e03a3e", "#26282a"],
  "Boston Celtics": ["#007a33", "#ba9653"],
  "Brooklyn Nets": ["#000000", "#ffffff"],
  "Charlotte Hornets": ["#1d1160", "#00788c"],
  "Chicago Bulls": ["#ce1141", "#000000"],
  "Cleveland Cavaliers": ["#860038", "#fdbb30"],
  "Dallas Mavericks": ["#00538c", "#002b5e"],
  "Denver Nuggets": ["#0e2240", "#fec524"],
  "Detroit Pistons": ["#c8102e", "#1d42ba"],
  "Golden State Warriors": ["#1d428a", "#ffc72c"],
  "Houston Rockets": ["#ce1141", "#000000"],
  "Indiana Pacers": ["#002d62", "#fdbb30"],
  "Los Angeles Clippers": ["#c8102e", "#1d428a"],
  "Los Angeles Lakers": ["#552583", "#fdb927"],
  "Memphis Grizzlies": ["#5d76a9", "#12173f"],
  "Miami Heat": ["#98002e", "#f9a01b"],
  "Milwaukee Bucks": ["#00471b", "#eee1c6"],
  "Minnesota Timberwolves": ["#0c2340", "#236192"],
  "New Orleans Pelicans": ["#0c2340", "#c8102e"],
  "New York Knicks": ["#006bb6", "#f58426"],
  "Oklahoma City Thunder": ["#007ac1", "#ef3b24"],
  "Orlando Magic": ["#0077c0", "#c4ced4"],
  "Philadelphia 76ers": ["#006bb6", "#ed174c"],
  "Phoenix Suns": ["#1d1160", "#e56020"],
  "Portland Trailblazers": ["#e03a3e", "#000000"],
  "Portland Trail Blazers": ["#e03a3e", "#000000"],
  "Sacramento Kings": ["#5a2d81", "#63727a"],
  "San Antonio Spurs": ["#c4ced4", "#000000"],
  "Toronto Raptors": ["#ce1141", "#000000"],
  "Utah Jazz": ["#002b5c", "#00471b"],
  "Washington Wizards": ["#002b5c", "#e31837"],
  // Historical/Custom teams
  "St. Louis Spirits": ["#89bfd3", "#7a1319", "#07364f"],
  "Seattle SuperSonics": ["#006bb6", "#ffc72c"],
  "Vancouver Grizzlies": ["#5d76a9", "#ffffff"],
};

export function PlayerFace({ face, imageUrl, size = 64, className = "", teams = [], currentTeam }: PlayerFaceProps) {
  const faceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (faceRef.current) {
      // Clear previous content
      faceRef.current.innerHTML = "";
      
      // Priority 1: Real player image URL
      if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.width = `${size}px`;
        img.style.height = `${size}px`;
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        img.style.background = 'transparent';
        
        img.onload = () => {
          if (faceRef.current) {
            faceRef.current.appendChild(img);
          }
        };
        
        img.onerror = () => {
          // Fallback to faces.js if image fails to load
          generateFacesJSFace();
        };
        
        return;
      }
      
      // Priority 2: faces.js generated face
      generateFacesJSFace();
    }
    
    function generateFacesJSFace() {
      if (!faceRef.current) return;
      
      try {
        // Generate face - use provided face data or generate random
        let faceData = face ? face as any : generate();
        
        // Determine team colors - prioritize current active team
        let teamColors: string[] = [];
        let activeTeam = currentTeam;
        
        // Check for tid (team ID) in the face data first
        if (faceData && faceData.tid !== undefined) {
          console.log('Found team ID (tid):', faceData.tid);
          console.log('Current team from face data:', faceData.currentTeam);
          
          // Use the current team from face data if available
          if (faceData.currentTeam && TEAM_COLORS[faceData.currentTeam]) {
            activeTeam = faceData.currentTeam;
            console.log(`Using current team from face data: ${activeTeam}`);
          }
        }
        
        // If we have player data with years, find the current active team
        // First try from the passed data, then from face data
        const playerYears = (faceData && faceData.years) || [];
        if (playerYears.length > 0) {
          // For retired players or simulation years far in future, use their last team
          // Sort by end year to get the most recent team
          const sortedYears = [...playerYears].sort((a: any, b: any) => b.end - a.end);
          const lastTeam = sortedYears[0];
          if (lastTeam) {
            activeTeam = lastTeam.team;
          }
        }
        
        // Try to use the active team's colors
        if (activeTeam && TEAM_COLORS[activeTeam]) {
          teamColors = TEAM_COLORS[activeTeam];
          console.log(`Using mapped colors for active team ${activeTeam}:`, teamColors);
        } else if (currentTeam && TEAM_COLORS[currentTeam]) {
          teamColors = TEAM_COLORS[currentTeam];
          console.log(`Using mapped colors for ${currentTeam}:`, teamColors);
        } else if (teams.length > 0) {
          // Use the first team with mapped colors
          const mappedTeam = teams.find(team => TEAM_COLORS[team]);
          if (mappedTeam) {
            teamColors = TEAM_COLORS[mappedTeam];
            console.log(`Using mapped colors for ${mappedTeam}:`, teamColors);
          }
        }
        
        // Fallback to face data team colors if no mapping found
        if (teamColors.length === 0 && faceData && faceData.teamColors && Array.isArray(faceData.teamColors)) {
          teamColors = faceData.teamColors;
          console.log('Using team colors from face data:', teamColors);
        }
        
        // Final fallback to default colors
        if (teamColors.length === 0) {
          teamColors = ["#0066cc", "#ff0000"];
          console.log('Using default team colors');
        }
        
        // Apply team colors to the face data before display
        if (faceData) {
          faceData.teamColors = teamColors;
        }
        
        // Display the face with updated team colors
        display(faceRef.current, faceData);
        
        // Apply size styling and team colors to SVG
        const svg = faceRef.current?.querySelector('svg');
        if (svg) {
          svg.style.width = `${size}px`;
          svg.style.height = `${size}px`;
          svg.style.maxWidth = '100%';
          svg.style.maxHeight = '100%';
          svg.style.overflow = 'visible';
          
          // Apply team colors to jersey elements 
          const primaryColor = teamColors[0];
          const secondaryColor = teamColors[1] || teamColors[0];
            
          // Find and update jersey elements with team colors
          console.log('Applying team colors:', primaryColor, secondaryColor);
          
          // More comprehensive search for jersey elements
          const jerseySelectors = [
            '[id*="jersey"]',
            '[class*="jersey"]', 
            'g[id*="jersey"] path',
            'g[id*="jersey"] rect',
            'g[id*="jersey"] polygon',
            '[fill="#0066cc"]', // Default blue
            '[fill="#ff0000"]', // Default red
            '[fill="#0000ff"]', // Default blue variant
            '[fill="#cc0000"]', // Default red variant
            '[fill="#4682b4"]', // Default steel blue
            '[fill="#dc143c"]', // Default crimson
            '[fill="#1e90ff"]', // Default dodger blue
            '[fill="#b22222"]'  // Default fire brick
          ];
          
          jerseySelectors.forEach(selector => {
            const elements = svg.querySelectorAll(selector);
            elements.forEach((element, index) => {
              const color = index % 2 === 0 ? primaryColor : secondaryColor;
              element.setAttribute('fill', color);
              (element as HTMLElement).style.fill = color;
              console.log(`Updated element ${selector} to color:`, color);
            });
          });
          
          // Find all path/rect elements within jersey groups and update them
          const jerseyGroups = svg.querySelectorAll('g[id*="jersey"], g[class*="jersey"]');
          jerseyGroups.forEach(group => {
            const paths = group.querySelectorAll('path, rect, polygon, circle');
            paths.forEach((element, index) => {
              const color = index % 2 === 0 ? primaryColor : secondaryColor;
              element.setAttribute('fill', color);
              (element as HTMLElement).style.fill = color;
              console.log('Updated jersey group element to color:', color);
            });
          });
          
          // Use CSS to hide white backgrounds without removing elements
          const style = document.createElement('style');
          style.textContent = `
            svg rect[fill="#ffffff"],
            svg rect[fill="white"],
            svg rect[fill="#fff"],
            svg rect[fill="#f8f8f8"] {
              opacity: 0 !important;
              display: none !important;
            }
          `;
          svg.appendChild(style);
          
          // Ensure proper viewBox to prevent cutoff
          if (!svg.getAttribute('viewBox')) {
            svg.setAttribute('viewBox', '0 0 400 600');
          }
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        }
      } catch (error) {
        console.error("Error generating face:", error);
        // Fallback: create a simple colored div
        if (faceRef.current) {
          const fallback = document.createElement('div');
          fallback.style.width = `${size}px`;
          fallback.style.height = `${size}px`;
          fallback.style.backgroundColor = '#6b7280';
          fallback.style.borderRadius = '50%';
          fallback.style.display = 'flex';
          fallback.style.alignItems = 'center';
          fallback.style.justifyContent = 'center';
          fallback.style.fontSize = '12px';
          fallback.style.color = 'white';
          fallback.textContent = '?';
          faceRef.current.appendChild(fallback);
        }
      }
    }
  }, [face, imageUrl, size, teams, currentTeam]);

  return (
    <div 
      ref={faceRef} 
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}