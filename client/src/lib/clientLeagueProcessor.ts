import type { FileUploadData, InsertPlayer, LeagueData, BBGMPlayer, Team } from '@shared/schema';
import { normalizeBBGM } from './normalizeBBGM';
import { Achievements, achievementCounts } from '@shared/achievements';

export interface BBGMLeagueData {
  players?: any[];
  teams?: any[];
  [key: string]: any;
}

export async function processLeagueDataClientSide(rawLeagueJson: any): Promise<FileUploadData> {
  console.log("Processing league data client-side...");
  console.log("🚀 Starting client-side league processing...");
  
  // First normalize using the new BBGM normalization
  const leagueData = normalizeBBGM(rawLeagueJson);
  console.log(`Found ${leagueData.players.length} players in BBGM format`);
  console.log(`Found ${leagueData.teams.length} teams in BBGM file`);
  
  // Generate achievement diagnostics
  const counts = achievementCounts(leagueData);
  console.log("Achievement counts:", counts);

  // Convert normalized data back to FileUploadData format
  const processedPlayers: InsertPlayer[] = [];
  
  for (const bbgmPlayer of leagueData.players) {
    try {
      const player = await convertBBGMPlayerToInsertPlayer(bbgmPlayer, leagueData);
      if (player) {
        processedPlayers.push(player);
      }
    } catch (error) {
      console.warn(`Error converting player ${bbgmPlayer.pid || 'unknown'}:`, error);
      // Continue with other players
    }
  }

  // Convert teams to FileUploadData format
  const teams = leagueData.teams.map(team => ({
    name: team.name,
    abbrev: team.abbrev,
    logo: undefined
  }));
  
  // Collect all achievements that have players
  const availableAchievements = Object.keys(Achievements).filter(achName => {
    const testFn = Achievements[achName as keyof typeof Achievements];
    return leagueData.players.some(p => {
      try {
        return testFn(p, leagueData);
      } catch {
        return false;
      }
    });
  });
  
  const result = {
    players: processedPlayers,
    teams,
    achievements: availableAchievements
  };
  
  console.log(`Processed ${result.players.length} players, ${result.teams.length} teams, ${result.achievements.length} achievements`);
  
  return result;
}

// Convert normalized BBGM player to InsertPlayer format
async function convertBBGMPlayerToInsertPlayer(bbgmPlayer: BBGMPlayer, leagueData: LeagueData): Promise<InsertPlayer | null> {
  if (!bbgmPlayer) return null;
  
  // Convert team IDs to team names
  const teamNames: string[] = [];
  const years: { team: string; start: number; end: number }[] = [];
  
  // Group seasons by team to create year ranges
  const teamSeasons = new Map<number, number[]>();
  bbgmPlayer.seasons.forEach(season => {
    if (!teamSeasons.has(season.tid)) {
      teamSeasons.set(season.tid, []);
    }
    teamSeasons.get(season.tid)!.push(season.season);
  });
  
  teamSeasons.forEach((seasons, tid) => {
    const team = leagueData.teams.find(t => t.tid === tid);
    if (team) {
      teamNames.push(team.name);
      const sortedSeasons = seasons.sort((a, b) => a - b);
      years.push({
        team: team.name,
        start: sortedSeasons[0],
        end: sortedSeasons[sortedSeasons.length - 1]
      });
    }
  });
  
  // Convert achievements using the new predicates
  const achievements: string[] = [];
  Object.entries(Achievements).forEach(([achName, testFn]) => {
    try {
      if (testFn(bbgmPlayer, leagueData)) {
        achievements.push(achName);
      }
    } catch (error) {
      // Ignore test errors for individual players
    }
  });
  
  return {
    name: bbgmPlayer.name,
    pid: bbgmPlayer.pid,
    teams: teamNames,
    years,
    achievements,
    stats: bbgmPlayer.seasons || {},
    face: null,
    imageUrl: null,
    careerWinShares: Math.round(bbgmPlayer.career.pts / 100), // Simple approximation
    quality: 50 // Default quality
  };
}