import { useMemo } from "react";
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
  // Generate SVG markup once and memoize it - no resize handlers needed
  const svgMarkup = useMemo(() => {
    if (imageUrl) {
      // Return image markup for real player photos
      return `
        <img 
          src="${imageUrl}" 
          alt="Player" 
          style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;"
        />
      `;
    } else if (face) {
      try {
        // Generate face using faces.js
        let faceData = face as any;
        
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
        
        // Use mapped team colors if available
        if (activeTeam && TEAM_COLORS[activeTeam]) {
          teamColors = TEAM_COLORS[activeTeam];
          console.log(`Using mapped colors for active team ${activeTeam}:`, teamColors);
        }
        
        // Apply team colors if available
        if (teamColors.length >= 2) {
          console.log("Applying team colors:", teamColors[0], teamColors[1]);
          
          // Override face colors with team colors
          faceData.teamColors = {
            primary: teamColors[0],
            secondary: teamColors[1],
            accent: teamColors[2] || teamColors[0]
          };
        }
        
        // Generate the SVG
        let svg = display(faceData);
        
        // Ensure the SVG is scalable by modifying its attributes
        svg = svg.replace(/<svg[^>]*>/, (match) => {
          // Remove fixed width/height and add viewBox if not present
          let modifiedMatch = match
            .replace(/\s*width\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\s*height\s*=\s*["'][^"']*["']/gi, '');
          
          // Add viewBox if not present
          if (!modifiedMatch.includes('viewBox')) {
            modifiedMatch = modifiedMatch.replace('<svg', '<svg viewBox="0 0 400 600"');
          }
          
          // Add style for 100% sizing
          modifiedMatch = modifiedMatch.replace('<svg', '<svg style="width: 100%; height: 100%;"');
          
          return modifiedMatch;
        });
        
        // Apply additional team styling if colors are available
        if (teamColors.length >= 2) {
          // Update jersey colors in the SVG
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
          const jerseyElements = svgDoc.querySelectorAll('[class*="jersey"]');
          jerseyElements.forEach(element => {
            element.setAttribute('fill', teamColors[0]);
            console.log(`Updated element [class*="jersey"] to color:`, teamColors[0]);
          });
          
          // Serialize back to string
          const serializer = new XMLSerializer();
          svg = serializer.serializeToString(svgDoc);
        }
        
        return svg;
      } catch (error) {
        console.error("Error generating face:", error);
        // Fallback: return a simple colored circle
        return `
          <div style="
            width: 100%; 
            height: 100%; 
            background-color: #6b7280; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: 12px; 
            color: white;
          ">?</div>
        `;
      }
    } else {
      // No face data or image - show fallback
      return `
        <div style="
          width: 100%; 
          height: 100%; 
          background-color: #6b7280; 
          border-radius: 50%; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-size: 12px; 
          color: white;
        ">?</div>
      `;
    }
  }, [face, imageUrl, teams, currentTeam]);

  return (
    <div 
      className={`relative flex-shrink-0 ${className}`}
      style={{ 
        width: size, 
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}