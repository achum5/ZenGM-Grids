import type { FileUploadData, InsertPlayer, TeamInfo } from '@shared/schema';

export interface BBGMLeagueData {
  players?: any[];
  teams?: any[];
  [key: string]: any;
}

export async function processLeagueDataClientSide(leagueData: BBGMLeagueData): Promise<FileUploadData> {
  console.log("Processing league data client-side...");
  console.log("🚀 Starting client-side league processing...");
  
  if (!leagueData.players || !Array.isArray(leagueData.players)) {
    throw new Error("Invalid league data: Missing or invalid players array");
  }

  const rawPlayers = leagueData.players;
  console.log(`Found ${rawPlayers.length} players in BBGM format`);

  // Create team mapping from BBGM teams data
  const teamMap = new Map<number, {name: string, abbrev: string, logo?: string}>();
  if (leagueData.teams && Array.isArray(leagueData.teams)) {
    console.log(`Found ${leagueData.teams.length} teams in BBGM file`);
    leagueData.teams.forEach((team: any, index: number) => {
      if (team && team.region && team.name) {
        const teamInfo = {
          name: `${team.region} ${team.name}`,
          abbrev: team.abbrev || team.tid || team.region?.substring(0, 3).toUpperCase() || 'UNK',
          logo: team.imgURL || team.imgUrl || team.logo
        };
        teamMap.set(index, teamInfo);
      }
    });
  } else {
    console.log("No teams array found in BBGM file");
  }

  // Transform BBGM player data to our format
  const players: InsertPlayer[] = rawPlayers.map((player: any) => {
    const name = player.firstName && player.lastName 
      ? `${player.firstName} ${player.lastName}` 
      : player.name || "Unknown Player";
    
    // Map team ID to team name using BBGM teams data
    const teams: string[] = [];
    if (player.tid !== undefined && player.tid >= 0) {
      const teamInfo = teamMap.get(player.tid);
      const teamName = teamInfo?.name || `Team ${player.tid}`;
      teams.push(teamName);
    }
    
    // Also collect teams from stats history - only include teams where player actually played games
    const allTeams = new Set(teams);
    if (player.stats && Array.isArray(player.stats)) {
      player.stats.forEach((stat: any) => {
        // Only include teams where the player actually played games
        if (stat.tid !== undefined && stat.tid >= 0 && (stat.gp || 0) > 0) {
          const teamInfo = teamMap.get(stat.tid);
          const teamName = teamInfo?.name || `Team ${stat.tid}`;
          allTeams.add(teamName);
        }
      });
    }
    
    // Process achievements and career stats
    const achievements: string[] = [];
    
    // Helper function to calculate career totals (regular season only)
    function careerTotalsRegularSeason(p: any) {
      let pts=0, ast=0, stl=0, blk=0, tp=0, orb=0, drb=0;
      for (const s of p.stats ?? []) {
        if (s.playoffs) continue; // Regular season only
        pts += s.pts ?? 0;
        ast += s.ast ?? 0;
        stl += s.stl ?? 0;
        blk += s.blk ?? 0;
        tp  += s.tp  ?? 0;
        orb += s.orb ?? 0;
        drb += s.drb ?? 0;
      }
      const trb = orb + drb;
      return {pts, trb, ast, stl, blk, tp};
    }
    
    function minGamesForSeason(season: number): number {
      const G = 82; // Default to 82 games
      return Math.ceil(0.58 * G); // 58% threshold for rate-based achievements
    }
    
    const careerTotals = careerTotalsRegularSeason(player);
    
    // Career total achievements
    if (careerTotals.pts >= 20000) achievements.push("20,000+ Career Points");
    if (careerTotals.trb >= 10000) achievements.push("10,000+ Career Rebounds");
    if (careerTotals.ast >= 5000) achievements.push("5,000+ Career Assists");
    if (careerTotals.stl >= 2000) achievements.push("2,000+ Career Steals");
    if (careerTotals.blk >= 1500) achievements.push("1,500+ Career Blocks");
    if (careerTotals.tp >= 2000) achievements.push("2,000+ Made Threes");

    // Check for season-based statistical achievements (regular season only)
    if (player.stats && Array.isArray(player.stats)) {
      const regularSeasonStats = player.stats.filter((s: any) => !s.playoffs);
      
      for (const season of regularSeasonStats) {
        const gp = season.gp || 0;
        const minGames = minGamesForSeason(season.season);
        
        if (gp < minGames) continue; // Require minimum games for rate-based achievements
        
        // Calculate per-game averages properly
        const ppg = (season.pts || 0) / gp;
        const rpg = ((season.orb || 0) + (season.drb || 0)) / gp;
        const apg = (season.ast || 0) / gp;
        const spg = (season.stl || 0) / gp;  
        const bpg = (season.blk || 0) / gp;
        
        // Single-season per-game achievements (avoid duplicates)
        if (ppg >= 30 && !achievements.includes("Averaged 30+ PPG in a Season")) {
          achievements.push("Averaged 30+ PPG in a Season");
        }
        if (apg >= 10 && !achievements.includes("Averaged 10+ APG in a Season")) {
          achievements.push("Averaged 10+ APG in a Season");
        }
        if (rpg >= 15 && !achievements.includes("Averaged 15+ RPG in a Season")) {
          achievements.push("Averaged 15+ RPG in a Season");
        }
        if (bpg >= 3 && !achievements.includes("Averaged 3+ BPG in a Season")) {
          achievements.push("Averaged 3+ BPG in a Season");
        }
        if (spg >= 2.5 && !achievements.includes("Averaged 2.5+ SPG in a Season")) {
          achievements.push("Averaged 2.5+ SPG in a Season");
        }
        
        // 50/40/90 achievement with attempt minimums
        const MIN_FGA = 300, MIN_TPA = 82, MIN_FTA = 125;
        if (season.fga >= MIN_FGA && season.tpa >= MIN_TPA && season.fta >= MIN_FTA) {
          const fgPct = (season.fg || 0) / season.fga;
          const tpPct = (season.tp || 0) / season.tpa;
          const ftPct = (season.ft || 0) / season.fta;
          
          if (fgPct >= 0.5 && tpPct >= 0.4 && ftPct >= 0.9) {
            if (!achievements.includes("Shot 50/40/90 in a Season")) {
              achievements.push("Shot 50/40/90 in a Season");
            }
          }
        }
      }
    }
    
    // Process draft achievements
    if (player.draft) {
      if (player.draft.round === 1 && player.draft.pick === 1) {
        achievements.push("#1 Overall Draft Pick");
      }
      if (player.draft.round === 1) {
        achievements.push("First Round Pick");
      }
      if (player.draft.round === 2) {
        achievements.push("2nd Round Pick");
      }
      if (player.draft.round === 0 || player.draft.pick === 0 || player.draft.tid < 0) {
        achievements.push("Undrafted Player");
      }
    }
    
    // Career length achievement
    if (player.stats && Array.isArray(player.stats)) {
      const distinctSeasons = new Set(
        player.stats
          .filter((s: any) => !s.playoffs && (s.gp || 0) > 0)
          .map((s: any) => s.season)
      );
      if (distinctSeasons.size >= 15) {
        achievements.push("Played 15+ Seasons");
      }
    }
    
    // Only One Team achievement
    if (player.stats && Array.isArray(player.stats)) {
      const distinctTeams = new Set(
        player.stats
          .filter((s: any) => (s.gp || 0) > 0)
          .map((s: any) => s.tid)
      );
      if (distinctTeams.size === 1) {
        achievements.push("Only One Team");
      }
    }
    
    // Extract career years and teams from statistics
    const years: { team: string; start: number; end: number }[] = [];
    if (player.stats && Array.isArray(player.stats)) {
      const sortedStats = player.stats
        .filter((stat: any) => stat.season && stat.tid !== undefined && (stat.gp || 0) > 0)
        .sort((a: any, b: any) => a.season - b.season);
      
      let currentTeam: string | null = null;
      let currentStart: number | null = null;
      let currentEnd: number | null = null;
      
      sortedStats.forEach((stat: any) => {
        const teamInfo = teamMap.get(stat.tid);
        const teamName = teamInfo?.name || `Team ${stat.tid}`;
        
        if (teamName !== currentTeam) {
          // Save previous stint if it exists
          if (currentTeam && currentStart && currentEnd) {
            years.push({ team: currentTeam, start: currentStart, end: currentEnd });
          }
          // Start new stint
          currentTeam = teamName;
          currentStart = stat.season;
          currentEnd = stat.season;
        } else {
          // Continue current stint
          currentEnd = stat.season;
        }
      });
      
      // Save final stint
      if (currentTeam && currentStart && currentEnd) {
        years.push({ team: currentTeam, start: currentStart, end: currentEnd });
      }
    }
    
    // Calculate career win shares from stats (if available)
    let careerWinShares = 0;
    if (player.stats && Array.isArray(player.stats)) {
      player.stats.forEach((stat: any) => {
        if (stat.ws !== undefined) {
          careerWinShares += stat.ws || 0;
        } else if (stat.winShares !== undefined) {
          careerWinShares += stat.winShares || 0;
        } else if (stat.WS !== undefined) {
          careerWinShares += stat.WS || 0;
        }
      });
    }
    
    // If no win shares found, use overall rating as a proxy
    if (careerWinShares === 0 && player.ratings && Array.isArray(player.ratings)) {
      const avgRating = player.ratings.reduce((sum: number, rating: any) => sum + (rating.ovr || 0), 0) / player.ratings.length;
      careerWinShares = avgRating / 10; // Rough approximation
    }

    // Enhance face data with team ID and team info for color mapping
    let enhancedFace = player.face || null;
    if (enhancedFace && player.tid !== undefined && player.tid >= 0) {
      enhancedFace = {
        ...enhancedFace,
        tid: player.tid,
        currentTeam: teamMap.get(player.tid)?.name || `Team ${player.tid}`,
        teamAbbrev: teamMap.get(player.tid)?.abbrev || null
      };
    }

    return {
      name,
      pid: player.pid || undefined,
      teams: Array.from(allTeams),
      years,
      achievements,
      stats: player.ratings || player.stats || undefined,
      face: enhancedFace,
      imageUrl: player.imgURL || player.imageUrl || player.img || undefined,
      careerWinShares: Math.round(careerWinShares * 10), // Convert to integer (tenths)
      quality: 50 // Will be calculated later
    };
  }).filter((p: any) => p.name !== "Unknown Player"); // Only include players with valid names

  // Extract teams and achievements for frontend
  const teamNames = Array.from(new Set(players.flatMap(p => p.teams)));
  const achievements = Array.from(new Set(players.flatMap(p => p.achievements)));
  
  const teams: TeamInfo[] = teamNames.map(name => {
    // Find the team info from our mapping
    const teamInfo = Array.from(teamMap.values()).find(t => t.name === name);
    return {
      name,
      abbrev: teamInfo?.abbrev || name.substring(0, 3).toUpperCase(),
      logo: teamInfo?.logo
    };
  });

  console.log(`Processed ${players.length} players, ${teams.length} teams, ${achievements.length} achievements`);

  return {
    players,
    teams,
    achievements
  };
}