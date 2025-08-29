// Extract only what grid generation needs.
// Adjust mapping as needed based on your league JSON shape.

export type GridTeam = { tid: number; name: string; abbrev?: string };
export type GridPlayer = { pid: number; name: string; teams: Array<{ tid: number; season?: number }> };

interface BBGMPlayer {
  firstName?: string;
  lastName?: string;
  name?: string;
  tid?: number;
  stats?: Array<{
    season: number;
    tid?: number;
    playoffs?: boolean;
    gp?: number;
    pts?: number;
    ast?: number;
    stl?: number;
    blk?: number;
    tp?: number;
    orb?: number;
    drb?: number;
    ws?: number;
  }>;
  draft?: {
    pick?: number;
    round?: number;
  };
  face?: any;
  imageUrl?: string;
  pid?: number;
}

interface BBGMTeam {
  region?: string;
  name?: string;
  abbrev?: string;
  tid?: number;
  imgURL?: string;
  imgUrl?: string;
  logo?: string;
}

interface BBGMLeague {
  players?: BBGMPlayer[];
  teams?: BBGMTeam[];
}

export function toGridDataset(league: any): { teams: GridTeam[]; players: GridPlayer[] } {
  const teams: GridTeam[] =
    league?.teams?.map((t: any) => ({ 
      tid: t.tid ?? t.teamId ?? t.id, 
      name: (t.region && t.name) ? `${t.region} ${t.name}` : (t.name || t.region || t.teamName), 
      abbrev: t.abbrev 
    })) ?? [];

  const players: GridPlayer[] =
    league?.players?.map((p: any) => ({
      pid: p.pid ?? p.playerId ?? p.id,
      name: p.name || [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown",
      teams: (p.stats || p.careerStats || p.teamHistory || []).map((s: any) => ({
        tid: s.tid ?? s.teamId ?? s.tidBefore ?? s.tidAfter ?? s.teamID,
        season: s.season ?? s.year,
      })).filter((x: any) => x && x.tid != null),
    })) ?? [];

  return { teams, players };
}

// Legacy function for compatibility - now just calls toGridDataset
export function processLeagueData(leagueData: any): { teams: GridTeam[]; players: GridPlayer[] } {
  console.log("🚀 CLIENT-SIDE LEAGUE PROCESSING STARTED");
  console.log("League data keys:", Object.keys(leagueData));
  
  // Handle BBGM format
  let rawPlayers: BBGMPlayer[] = [];
  if (leagueData.players && Array.isArray(leagueData.players)) {
    rawPlayers = leagueData.players;
    console.log(`Found ${rawPlayers.length} players in BBGM format`);
  } else if (Array.isArray(leagueData)) {
    rawPlayers = leagueData as BBGMPlayer[];
    console.log(`Found ${rawPlayers.length} players in array format`);
  } else {
    throw new Error("Invalid data format. Expected players array.");
  }
  
  // Create team mapping from BBGM teams data
  const teamMap = new Map<number, {name: string, abbrev: string, logo?: string}>();
  if (leagueData.teams && Array.isArray(leagueData.teams)) {
    console.log(`Found ${leagueData.teams.length} teams in BBGM file`);
    leagueData.teams.forEach((team: BBGMTeam, index: number) => {
      if (team && team.region && team.name) {
        const teamInfo = {
          name: `${team.region} ${team.name}`,
          abbrev: team.abbrev || team.region?.substring(0, 3).toUpperCase() || 'UNK',
          logo: team.imgURL || team.imgUrl || team.logo
        };
        teamMap.set(index, teamInfo);
      }
    });
    console.log("Team mapping created:", Array.from(teamMap.entries()).slice(0, 5));
  }
  
  // Transform BBGM player data to our format
  const players = rawPlayers.map((player: BBGMPlayer) => {
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
        if (stat.tid !== undefined && stat.tid >= 0 && (stat.gp || 0) > 0) {
          const teamInfo = teamMap.get(stat.tid);
          const teamName = teamInfo?.name || `Team ${stat.tid}`;
          allTeams.add(teamName);
        }
      });
    }
    
    // Process achievements and career stats
    const achievements: string[] = [];
    
    function careerTotalsRegularSeason(p: BBGMPlayer) {
      let pts=0, ast=0, stl=0, blk=0, tp=0, orb=0, drb=0;
      for (const s of p.stats ?? []) {
        if (s.playoffs) continue;
        pts += s.pts ?? 0; ast += s.ast ?? 0; stl += s.stl ?? 0;
        blk += s.blk ?? 0; tp += s.tp ?? 0; orb += s.orb ?? 0; drb += s.drb ?? 0;
      }
      return {pts, trb: orb + drb, ast, stl, blk, tp};
    }
    
    const careerTotals = careerTotalsRegularSeason(player);
    
    // Career achievements
    if (careerTotals.pts >= 20000) achievements.push("20,000+ Career Points");
    if (careerTotals.trb >= 10000) achievements.push("10,000+ Career Rebounds");
    if (careerTotals.ast >= 5000) achievements.push("5,000+ Career Assists");
    if (careerTotals.stl >= 2000) achievements.push("2,000+ Career Steals");
    if (careerTotals.blk >= 1500) achievements.push("1,500+ Career Blocks");
    if (careerTotals.tp >= 2000) achievements.push("2,000+ Made Threes");

    // Process draft achievements
    if (player.draft) {
      if (player.draft.pick === 1) achievements.push("#1 Overall Draft Pick");
      if (player.draft.round === 1) achievements.push("First Round Pick");
      else if (player.draft.round === 2) achievements.push("2nd Round Pick");
      else if (!player.draft.pick) achievements.push("Undrafted Player");
    } else {
      achievements.push("Undrafted Player");
    }
    
    // Process years played per team
    const years: Array<{ team: string; start: number; end: number }> = [];
    if (player.stats && Array.isArray(player.stats)) {
      const sortedStats = player.stats
        .filter((stat: any) => !stat.playoffs)
        .sort((a: any, b: any) => a.season - b.season);
      
      let currentTeam: string | null = null;
      let currentStart: number | null = null;
      let currentEnd: number | null = null;
      
      sortedStats.forEach((stat: any) => {
        if (stat.tid !== undefined && stat.tid >= 0 && (stat.gp || 0) > 0) {
          const teamInfo = teamMap.get(stat.tid);
          const teamName = teamInfo?.name || `Team ${stat.tid}`;
          
          if (teamName !== currentTeam) {
            if (currentTeam && currentStart && currentEnd) {
              years.push({ team: currentTeam, start: currentStart, end: currentEnd });
            }
            currentTeam = teamName;
            currentStart = stat.season;
            currentEnd = stat.season;
          } else {
            currentEnd = stat.season;
          }
        }
      });
      
      if (currentTeam && currentStart && currentEnd) {
        years.push({ team: currentTeam, start: currentStart, end: currentEnd });
      }
    }
    
    // Calculate career win shares
    let careerWinShares = 0;
    if (player.stats && Array.isArray(player.stats)) {
      player.stats.forEach((stat: any) => {
        if (!stat.playoffs && stat.ws) {
          careerWinShares += stat.ws;
        }
      });
    }
    
    return {
      name,
      teams: Array.from(allTeams),
      years,
      achievements,
      stats: player.stats,
      face: player.face,
      imageUrl: player.imageUrl,
      careerWinShares,
      quality: 50 // Default quality score
    };
  });

  console.log(`Processed ${players.length} players`);
  
  // Filter teams with at least 10 players (minimum for grids)
  const teamNames = Array.from(new Set(players.flatMap(p => p.teams)));
  const teams: TeamInfo[] = teamNames
    .filter(teamName => {
      const teamPlayerCount = players.filter(p => p.teams.includes(teamName)).length;
      return teamPlayerCount >= 10;
    })
    .map(name => {
      const teamInfo = Array.from(teamMap.values()).find(t => t.name === name);
      return {
        name,
        abbrev: teamInfo?.abbrev || name.substring(0, 3).toUpperCase(),
        logo: teamInfo?.logo
      };
    });

  const achievements = Array.from(new Set(players.flatMap(p => p.achievements)));

  console.log(`✅ CLIENT-SIDE PROCESSING COMPLETE: ${players.length} players, ${teams.length} teams, ${achievements.length} achievements`);

  return toGridDataset(leagueData);
}