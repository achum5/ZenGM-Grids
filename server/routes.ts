import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";

import { z } from "zod";
import { gunzip } from "zlib";
import { promisify } from "util";
import { insertPlayerSchema, insertGameSchema, insertGameSessionSchema, type FileUploadData, type GridCriteria } from "@shared/schema";

const gunzipAsync = promisify(gunzip);

function sample<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function buildCorrectAnswers(
  players: any[],
  columnCriteria: { value: string; type: string }[],
  rowCriteria: { value: string; type: string }[]
) {
  const out: Record<string, string[]> = {};
  for (let r = 0; r < rowCriteria.length; r++) {
    for (let c = 0; c < columnCriteria.length; c++) {
      const colCriteria = columnCriteria[c];
      const rowCriteria_item = rowCriteria[r];
      
      let names: string[] = [];
      
      if (colCriteria.type === "team" && rowCriteria_item.type === "team") {
        // Both are teams - find players who played for both teams
        names = players
          .filter(p => p.teams.includes(colCriteria.value) && p.teams.includes(rowCriteria_item.value))
          .map(p => p.name);
      } else if (colCriteria.type === "team" && rowCriteria_item.type === "achievement") {
        // Team x Achievement - find players who played for team AND have achievement
        names = players
          .filter(p => p.teams.includes(colCriteria.value) && p.achievements.includes(rowCriteria_item.value))
          .map(p => p.name);
      } else if (colCriteria.type === "achievement" && rowCriteria_item.type === "team") {
        // Achievement x Team - find players who have achievement AND played for team
        names = players
          .filter(p => p.achievements.includes(colCriteria.value) && p.teams.includes(rowCriteria_item.value))
          .map(p => p.name);
      }
      
      out[`${r}_${c}`] = names; // keep underscore key format
    }
  }
  return out;
}

function gridIsValid(ca: Record<string, string[]>) {
  // Ensure every cell has at least one valid answer
  const allCellsHaveAnswers = Object.values(ca).every(list => list && list.length > 0);
  
  if (!allCellsHaveAnswers) {
    return false;
  }
  
  // Just ensure all cells have answers - remove difficulty constraint for now
  return true;
}

// Career quality scoring system helpers
function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function percentileOf(sortedAsc: number[], v: number): number {
  if (!sortedAsc.length) return 50;
  let lo = 0, hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return Math.round(100 * (lo - 0.5) / sortedAsc.length);
}

interface SeasonStats {
  mp?: number;
  ws?: number;
  ws48?: number;
  bpm?: number;
  [key: string]: any;
}

function deriveCareerAggregates(players: any[]) {
  for (const p of players) {
    const seasons = p.stats && Array.isArray(p.stats) ? p.stats : [];
    
    const mins = seasons.reduce((s: number, szn: SeasonStats) => s + (szn.mp ?? 0), 0);
    const ws = seasons.reduce((s: number, szn: SeasonStats) => s + (szn.ws ?? 0), 0);

    // Minutes-weighted BPM
    const wBpmNum = seasons.reduce((s: number, szn: SeasonStats) => s + (szn.bpm ?? 0) * (szn.mp ?? 0), 0);
    const wBpmDen = mins || 1;
    const bpmW = wBpmNum / wBpmDen;

    // Peak WS/48 with >= 1000 minutes to avoid tiny samples
    let peak = -Infinity;
    for (const s of seasons) {
      const m = s.mp ?? 0;
      const w48 = s.ws48 ?? 0;
      if (m >= 1000 && Number.isFinite(w48)) peak = Math.max(peak, w48);
    }
    if (!Number.isFinite(peak)) peak = 0;

    p.careerMinutes = mins;
    p.careerWS = ws;
    p.careerBPM_weighted = bpmW;
    p.peakWS48 = peak;
  }
}

function assignQuality(players: any[]) {
  // Build arrays for percentiles
  const arrWS = players.map(p => p.careerWS ?? 0).sort((a, b) => a - b);
  const arrWS48 = players.map(p => p.peakWS48 ?? 0).sort((a, b) => a - b);
  const arrBPM = players.map(p => p.careerBPM_weighted ?? 0).sort((a, b) => a - b);

  for (const p of players) {
    const pWS = percentileOf(arrWS, p.careerWS ?? 0);
    const pWS48 = percentileOf(arrWS48, p.peakWS48 ?? 0);
    const pBPM = percentileOf(arrBPM, p.careerBPM_weighted ?? 0);

    const blended = 0.60 * pWS + 0.25 * pWS48 + 0.15 * pBPM;
    const r = clamp((p.careerMinutes ?? 0) / 6000, 0, 1);
    const quality = Math.round(r * blended + (1 - r) * 50);
    p.quality = clamp(quality, 1, 99);
  }
}


interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const upload = multer({ storage: multer.memoryStorage() });

// Validation schemas
const searchQuerySchema = z.object({
  q: z.string().min(1),
});

const answerSchema = z.object({
  row: z.number().min(0).max(2),
  col: z.number().min(0).max(2),
  player: z.string(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Upload league file from URL
  app.post("/api/upload-url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }
      
      console.log("Downloading file from URL:", url);
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ message: `Failed to download file: ${response.statusText}` });
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = url.split('/').pop() || 'league-file';
      
      // Process the downloaded file using the same logic as file upload
      await processLeagueFile(buffer, filename, res);
    } catch (error: any) {
      console.error("URL upload error:", error);
      res.status(500).json({ message: error.message || "Failed to process URL" });
    }
  });

  // Upload league file and parse players
  app.post("/api/upload", upload.single("file"), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      await processLeagueFile(req.file.buffer, req.file.originalname || 'league-file', res);
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ message: error.message || "Upload failed" });
    }
  });

  // Helper function to process league files
  async function processLeagueFile(fileBuffer: Buffer, filename: string, res: any) {
    try {
      let fileContent: string;
      
      // Check if file is gzipped by magic bytes or filename
      const isGzipped = filename.endsWith(".gz") || filename.endsWith(".gzip") || 
                       (fileBuffer.length >= 2 && fileBuffer[0] === 0x1f && fileBuffer[1] === 0x8b);
      
      if (isGzipped) {
        try {
          fileBuffer = await gunzipAsync(fileBuffer);
          console.log("Successfully decompressed gzip file");
        } catch (error) {
          console.error("Gzip decompression error:", error);
          return res.status(400).json({ message: "Failed to decompress gzip file" });
        }
      }
      
      fileContent = fileBuffer.toString();
      let players: any[] = [];

      const isJson = filename.includes(".json") || (isGzipped && filename.includes(".json"));

      if (isJson) {
        const data = JSON.parse(fileContent);
        let rawPlayers = [];
        
        console.log("File structure keys:", Object.keys(data));
        
        // Handle BBGM format
        if (data.players && Array.isArray(data.players)) {
          rawPlayers = data.players;
          console.log(`Found ${rawPlayers.length} players in BBGM format`);
        } else if (Array.isArray(data)) {
          rawPlayers = data;
          console.log(`Found ${rawPlayers.length} players in array format`);
        } else {
          console.log("Invalid JSON structure. Expected players array but got:", typeof data);
          return res.status(400).json({ message: "Invalid JSON format. Expected players array." });
        }
        
        // Create team mapping from BBGM teams data
        const teamMap = new Map<number, {name: string, abbrev: string, logo?: string}>();
        if (data.teams && Array.isArray(data.teams)) {
          console.log(`Found ${data.teams.length} teams in BBGM file`);
          data.teams.forEach((team: any, index: number) => {
            if (team && team.region && team.name) {
              const teamInfo = {
                name: `${team.region} ${team.name}`,
                abbrev: team.abbrev || team.tid || team.region?.substring(0, 3).toUpperCase() || 'UNK',
                logo: team.imgURL || team.imgUrl || team.logo
              };
              teamMap.set(index, teamInfo);
            }
          });
          console.log("Team mapping with abbreviations created:", Array.from(teamMap.entries()).slice(0, 5));
        } else {
          console.log("No teams array found in BBGM file");
        }
        
        // Transform BBGM player data to our format
        players = rawPlayers.map((player: any) => {
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
          
          // Process achievements and career stats for Immaculate Grid rules
          const achievements: string[] = [];
          let careerStats = {
            points: 0,
            rebounds: 0,
            assists: 0,
            blocks: 0,
            steals: 0,
            games: 0
          };
          
          // Calculate career totals from stats
          if (player.stats && Array.isArray(player.stats)) {
            player.stats.forEach((season: any) => {
              const gp = season.gp || 0;
              careerStats.points += (season.pts || 0) * gp;
              careerStats.rebounds += (season.trb || 0) * gp;
              careerStats.assists += (season.ast || 0) * gp;
              careerStats.blocks += (season.blk || 0) * gp;
              careerStats.steals += (season.stl || 0) * gp;
              careerStats.games += gp;
            });
          }

          // Add career milestone achievements based on comprehensive criteria
          if (careerStats.points >= 20000) achievements.push("20,000+ Career Points");
          if (careerStats.rebounds >= 10000) achievements.push("10,000+ Career Rebounds");
          if (careerStats.assists >= 5000) achievements.push("5,000+ Career Assists");
          if (careerStats.steals >= 2000) achievements.push("2,000+ Career Steals");
          if (careerStats.blocks >= 1500) achievements.push("1,500+ Career Blocks");

          // Check for season-based statistical achievements
          if (player.stats && Array.isArray(player.stats)) {
            let hasHighScoring = false;
            let hasModerateScoring = false;
            let hasGoodRebounder = false;
            let hasGoodPasser = false;
            let hasGoodBlocker = false;
            let hasGoodStealer = false;
            
            player.stats.forEach((season: any) => {
              const gamesPlayed = season.gp || 1;
              if (gamesPlayed < 20) return; // Minimum games threshold
              
              const ppg = (season.pts || 0);
              const rpg = (season.trb || 0);
              const apg = (season.ast || 0);
              const spg = (season.stl || 0);  
              const bpg = (season.blk || 0);
              
              // Single-season achievements  
              if (ppg >= 30) achievements.push("Averaged 30+ PPG in a Season");
              if (apg >= 10) achievements.push("Averaged 10+ APG in a Season");
              if (rpg >= 15) achievements.push("Averaged 15+ RPG in a Season");
              if (bpg >= 3) achievements.push("Averaged 3+ BPG in a Season");  
              if (spg >= 2.5) achievements.push("Averaged 2.5+ SPG in a Season");
              
              if (ppg >= 20 && !hasHighScoring) {
                achievements.push("20+ Points Per Game");
                hasHighScoring = true;
              } else if (ppg >= 10 && !hasModerateScoring && !hasHighScoring) {
                achievements.push("10+ Points Per Game");
                hasModerateScoring = true;
              }
              
              if (rpg >= 10 && !hasGoodRebounder) {
                achievements.push("10+ Rebounds Per Game");
                hasGoodRebounder = true;
              }
              
              if (apg >= 5 && !hasGoodPasser) {
                achievements.push("5+ Assists Per Game");
                hasGoodPasser = true;
              }
              
              if (bpg >= 1 && !hasGoodBlocker) {
                achievements.push("1+ Block Per Game");
                hasGoodBlocker = true;
              }
              
              if (spg >= 1 && !hasGoodStealer) {
                achievements.push("1+ Steal Per Game");
                hasGoodStealer = true;
              }
            });
          }
          
          // Process awards from BBGM data with comprehensive achievement mappings
          if (player.awards && Array.isArray(player.awards)) {
            player.awards.forEach((award: any) => {
              if (award.type) {
                switch (award.type) {
                  case "Champion":
                    achievements.push("NBA Champion");
                    achievements.push("Champion");
                    break;
                  case "Finals MVP":
                    achievements.push("Finals MVP");
                    break;
                  case "MVP":
                    achievements.push("MVP Winner");
                    break;
                  case "DPOY":
                    achievements.push("Defensive Player of the Year");
                    break;
                  case "SMOY":
                    achievements.push("Sixth Man of the Year");
                    break;
                  case "ROY":
                    achievements.push("Rookie of the Year");
                    break;
                  case "All Star":
                    achievements.push("All-Star Selection");
                    break;
                  case "All-League":
                    achievements.push("All-League Team");
                    break;
                  case "All-Defensive":
                    achievements.push("All-Defensive Team");
                    break;
                  case "All-Rookie":
                    achievements.push("All-League Team");
                    break;
                }
              }
            });
          }

          // Add draft-based achievements
          if (player.draft && player.draft.round) {
            if (player.draft.pick === 1) {
              achievements.push("#1 Overall Draft Pick");
            } else if (player.draft.round === 1) {
              achievements.push("First Round Pick");
            } else if (player.draft.round === 2) {
              achievements.push("2nd Round Pick");
            }
          } else {
            achievements.push("Undrafted Player");
          }

          // Add team-based achievements
          if (allTeams.size === 1) {
            achievements.push("Only One Team");
          }

          // Add career length achievement
          if (player.stats && player.stats.length >= 15) {
            achievements.push("Played 15+ Seasons");
          }

          // Add special BBGM Player easter egg (very rare - 0.1% chance)
          if (Math.random() < 0.001) {
            achievements.push("BBGM Player");
          }

          // Check special categories based on Immaculate Grid rules
          if (player.born && player.born.loc) {
            const birthplace = player.born.loc.toLowerCase();
            if (!birthplace.includes("usa") && !birthplace.includes("united states") && 
                !birthplace.includes("us") && !birthplace.includes("america")) {
              achievements.push("Born Outside US 50 States and DC");
            }
          }
          
          // Check draft status
          if (player.draft && player.draft.round === 1) {
            achievements.push("First Round Draft Pick");
          } else if (!player.draft || player.draft.round === 0 || player.draft.round === undefined) {
            achievements.push("Undrafted");
          }
          
          // Check if player played for only one team
          if (allTeams.size === 1) {
            achievements.push("Only One Team");
          }
          
          // Hall of Fame and retirement status
          if (player.hof) achievements.push('Hall of Fame');
          if (player.retiredYear) achievements.push('Retired');
          
          // Extract career years and teams from statistics - track separate stints for each team
          const years: { team: string; start: number; end: number }[] = [];
          if (player.stats && Array.isArray(player.stats)) {
            // Sort stats by season to process chronologically
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
              // BBGM uses 'ws' for win shares, but let's also check common variants
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
      } else {
        return res.status(400).json({ message: "Unsupported file format. Please upload JSON or gzipped league files only." });
      }

      console.log(`Parsed ${players.length} players from file`);
      if (players.length > 0) {
        console.log("Sample player:", JSON.stringify(players[0], null, 2));
      }

      // Validate and create players with better error handling
      const validatedPlayers: any[] = [];
      const errors: string[] = [];
      
      for (let i = 0; i < players.length; i++) { // Process all players
        try {
          // Apply defaults before validation
          const playerWithDefaults = {
            name: players[i].name || "Unknown Player",
            teams: players[i].teams || [],
            years: players[i].years || [],
            achievements: players[i].achievements || [],
            stats: players[i].stats,
            face: players[i].face,
            imageUrl: players[i].imageUrl || undefined,
            careerWinShares: players[i].careerWinShares || 0
          };
          
          const validatedPlayer = insertPlayerSchema.parse(playerWithDefaults);
          validatedPlayers.push(validatedPlayer);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Validation failed';
          if (errors.length < 10) { // Only store first 10 errors to save memory
            errors.push(`Player ${i + 1} (${players[i]?.name || 'unnamed'}): ${errorMsg}`);
          }
          if (i < 3) { // Only log first 3 errors to avoid spam
            console.log(`Validation error for player ${i + 1}:`, errorMsg);
          }
          // Skip invalid players but continue processing
          continue;
        }
      }
      
      console.log(`Successfully validated ${validatedPlayers.length} out of ${players.length} players`);
      if (errors.length > 0) {
        console.log(`First few errors:`, errors.slice(0, 3));
      }
      
      if (validatedPlayers.length === 0) {
        return res.status(400).json({ 
          message: "No valid players found in file", 
          errors: errors.slice(0, 10), // Show first 10 errors
          totalPlayers: players.length
        });
      }

      // Calculate career quality scores for all players
      deriveCareerAggregates(validatedPlayers);
      assignQuality(validatedPlayers);
      
      // Clear existing players and add new ones
      await storage.clearPlayers();
      const createdPlayers = await storage.createPlayers(validatedPlayers);

      // Extract teams and achievements for frontend
      const teamNames = Array.from(new Set(createdPlayers.flatMap(p => p.teams)));
      const achievements = Array.from(new Set(createdPlayers.flatMap(p => p.achievements)));
      
      // Define teamMap in the correct scope if it doesn't exist
      let finalTeamMap = new Map<number, {name: string, abbrev: string, logo?: string}>();
      if (isJson) {
        const data = JSON.parse(fileContent);
        if (data.teams && Array.isArray(data.teams)) {
          data.teams.forEach((team: any, index: number) => {
            if (team && team.region && team.name) {
              const teamInfo = {
                name: `${team.region} ${team.name}`,
                abbrev: team.abbrev || team.tid || team.region?.substring(0, 3).toUpperCase() || 'UNK',
                logo: team.imgURL || team.imgUrl || team.logo
              };
              finalTeamMap.set(index, teamInfo);
            }
          });
        }
      }
      
      const teams = teamNames.map(name => {
        // Find the team info from our mapping
        const teamInfo = Array.from(finalTeamMap.values()).find(t => t.name === name);
        return {
          name,
          abbrev: teamInfo?.abbrev || name.substring(0, 3).toUpperCase(),
          logo: teamInfo?.logo
        };
      });

      const result: FileUploadData = {
        players: createdPlayers.map(p => ({
          name: p.name,
          teams: p.teams,
          years: p.years,
          achievements: p.achievements,
          stats: p.stats || undefined,
          careerWinShares: p.careerWinShares || 0,
          quality: p.quality || 50
        })),
        teams,
        achievements
      };

      res.json(result);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid file format" });
    }
  }

  // Generate a new game grid
  app.post("/api/games/generate", async (req, res) => {
    try {
      const players = await storage.getPlayers();
      if (players.length === 0) {
        return res.status(400).json({ 
          message: "No players data available. Please upload a league file first." 
        });
      }

      // Get unique teams and filter out inactive franchises
      const allTeams = Array.from(new Set(players.flatMap(p => p.teams)));
      
      // Current active NBA teams (30 teams)
      const activeTeams = [
        "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets",
        "Chicago Bulls", "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets",
        "Detroit Pistons", "Golden State Warriors", "Houston Rockets", "Indiana Pacers",
        "Los Angeles Clippers", "Los Angeles Lakers", "Memphis Grizzlies", "Miami Heat",
        "Milwaukee Bucks", "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks",
        "Oklahoma City Thunder", "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns",
        "Portland Trail Blazers", "Portland Trailblazers", "Sacramento Kings", "San Antonio Spurs",
        "Toronto Raptors", "Utah Jazz", "Washington Wizards"
      ];
      
      // Filter to only include active teams
      const teams = allTeams.filter(team => activeTeams.includes(team));
      const allAchievements = Array.from(new Set(players.flatMap(p => p.achievements)));
      
      // Comprehensive Immaculate Grid criteria system
      const priorityAchievements = [
        // Career Milestones
        "20,000+ Career Points",
        "10,000+ Career Rebounds", 
        "5,000+ Career Assists",
        "2,000+ Career Steals",
        "1,500+ Career Blocks",
        "2,000+ Made Threes",
        
        // Single-Season Statistical Achievements
        "Averaged 30+ PPG in a Season",
        "Averaged 10+ APG in a Season",
        "Averaged 15+ RPG in a Season", 
        "Averaged 3+ BPG in a Season",
        "Averaged 2.5+ SPG in a Season",
        "Shot 50/40/90 in a Season",
        
        // League Leadership
        "Led League in Scoring",
        "Led League in Rebounds",
        "Led League in Assists",
        "Led League in Steals", 
        "Led League in Blocks",
        
        // Game Performance Feats
        "Scored 50+ in a Game",
        "Triple-Double in a Game",
        "20+ Rebounds in a Game",
        "20+ Assists in a Game",
        "10+ Threes in a Game",
        
        // Major Awards
        "MVP Winner",
        "Defensive Player of the Year", 
        "Rookie of the Year",
        "Sixth Man of the Year",
        "Most Improved Player",
        "Finals MVP",
        
        // Team Honors
        "All-League Team",
        "All-Defensive Team", 
        "All-Star Selection",
        "NBA Champion",
        
        // Career Length & Draft
        "Played 15+ Seasons",
        "#1 Overall Draft Pick",
        "Undrafted Player",
        "First Round Pick",
        "2nd Round Pick",
        
        // Special Categories
        "Made All-Star Team at Age 35+",
        "Only One Team",
        "Champion",
        "Hall of Fame",
        
        // Dynamic Teammate Criteria (will be populated with high Win Shares players)
        "Teammate of All-Time Greats",
        
        // Easter Egg - extremely rare
        "BBGM Player"
      ];

      // Add dynamic "Teammate of All-Time Greats" criteria based on career Win Shares
      const allTimeGreats = players
        .filter(p => p.careerWinShares && p.careerWinShares >= 150) // Very high threshold for all-time greats
        .sort((a, b) => (b.careerWinShares || 0) - (a.careerWinShares || 0))
        .slice(0, 20); // Top 20 by Win Shares
      
      // For each player, check if they were teammates with any all-time greats
      players.forEach(player => {
        for (const great of allTimeGreats) {
          if (player.name !== great.name) {
            // Check if they shared any teams
            const sharedTeams = player.teams.filter(team => great.teams.includes(team));
            if (sharedTeams.length > 0) {
              // Verify they actually played together (overlapping years)
              const playerYears = player.years || [];
              const greatYears = great.years || [];
              
              for (const team of sharedTeams) {
                const playerTeamYears = playerYears.find(y => y.team === team);
                const greatTeamYears = greatYears.find(y => y.team === team);
                
                if (playerTeamYears && greatTeamYears) {
                  // Check for year overlap
                  if (playerTeamYears.start <= greatTeamYears.end && 
                      playerTeamYears.end >= greatTeamYears.start) {
                    if (!player.achievements.includes("Teammate of All-Time Greats")) {
                      player.achievements.push("Teammate of All-Time Greats");
                    }
                    break;
                  }
                }
              }
            }
          }
        }
      });
      
      // Use priority achievements that exist in our dataset with sufficient players
      const achievements = priorityAchievements.filter(ach => {
        const playersWithAchievement = players.filter(p => p.achievements.includes(ach)).length;
        return allAchievements.includes(ach) && playersWithAchievement >= 2;
      }).sort(() => Math.random() - 0.5); // Randomize order to ensure variety

      if (teams.length < 3) {
        return res.status(400).json({ 
          message: "Not enough data to generate a grid. Need at least 3 teams." 
        });
      }

      // Loop up to 200 attempts to find a valid grid
      for (let attempt = 0; attempt < 200; attempt++) {
        let columnCriteria: GridCriteria[] = [];
        let rowCriteria: GridCriteria[] = [];
        
        // Heavily favor stat-based grids over team-only grids
        const gridType = Math.random();
        
        if (gridType < 0.02 && teams.length >= 6) {
          // 2% chance: 3 teams x 3 teams grid (very rare pure teams)
          const selectedTeams = sample(teams, 6);
          columnCriteria = selectedTeams.slice(0, 3).map(team => ({
            label: team,
            type: "team",
            value: team,
          }));
          rowCriteria = selectedTeams.slice(3, 6).map(team => ({
            label: team,
            type: "team", 
            value: team,
          }));
        } else if (gridType < 0.25 && achievements.length >= 1) {
          // 23% chance: (2 teams + 1 achievement) x (2 teams + 1 achievement) - mixed grid
          const selectedTeams = sample(teams, 4);
          const selectedAchievements = sample(achievements, 2);
          
          columnCriteria = [
            ...selectedTeams.slice(0, 2).map(team => ({
              label: team,
              type: "team",
              value: team,
            })),
            {
              label: selectedAchievements[0],
              type: "achievement", 
              value: selectedAchievements[0],
            }
          ];
          
          rowCriteria = [
            ...selectedTeams.slice(2, 4).map(team => ({
              label: team,
              type: "team",
              value: team,
            })),
            {
              label: selectedAchievements[1],
              type: "achievement",
              value: selectedAchievements[1],
            }
          ];
        } else if (gridType < 0.5 && achievements.length >= 1) {
          // 25% chance: (1 team + 2 achievements) x 3 teams grid
          const selectedTeams = sample(teams, 4);
          const selectedAchievements = sample(achievements, 2);
          
          columnCriteria = [
            {
              label: selectedTeams[0],
              type: "team",
              value: selectedTeams[0],
            },
            ...selectedAchievements.map(achievement => ({
              label: achievement,
              type: "achievement",
              value: achievement,
            }))
          ];
          
          rowCriteria = selectedTeams.slice(1, 4).map(team => ({
            label: team,
            type: "team",
            value: team,
          }));
        } else if (gridType < 0.75 && achievements.length >= 1) {
          // 25% chance: 3 teams x (1 team + 2 achievements) grid
          const selectedTeams = sample(teams, 4);
          const selectedAchievements = sample(achievements, 2);
          
          columnCriteria = selectedTeams.slice(0, 3).map(team => ({
            label: team,
            type: "team",
            value: team,
          }));
          
          rowCriteria = [
            {
              label: selectedTeams[3],
              type: "team",
              value: selectedTeams[3],
            },
            ...selectedAchievements.map(achievement => ({
              label: achievement,
              type: "achievement",
              value: achievement,
            }))
          ];
        } else if (gridType < 0.98 && achievements.length >= 3) {
          // 23% chance: (1 team + 2 achievements) x (1 team + 2 achievements) - heavy stats
          const selectedTeams = sample(teams, 2);
          const selectedAchievements = sample(achievements, 4);
          
          columnCriteria = [
            {
              label: selectedTeams[0],
              type: "team",
              value: selectedTeams[0],
            },
            ...selectedAchievements.slice(0, 2).map(achievement => ({
              label: achievement,
              type: "achievement",
              value: achievement,
            }))
          ];
          
          rowCriteria = [
            {
              label: selectedTeams[1],
              type: "team",
              value: selectedTeams[1],
            },
            ...selectedAchievements.slice(2, 4).map(achievement => ({
              label: achievement,
              type: "achievement",
              value: achievement,
            }))
          ];
        } else {
          // 2% chance: Fallback to mixed approach with available data
          const selectedTeams = sample(teams, Math.min(4, teams.length));
          const availableAchievements = sample(achievements, Math.min(2, achievements.length));
          
          if (selectedTeams.length >= 3 && availableAchievements.length >= 1) {
            columnCriteria = selectedTeams.slice(0, 3).map(team => ({
              label: team,
              type: "team",
              value: team,
            }));
            
            const rowTeams = selectedTeams.slice(3, Math.min(4, selectedTeams.length));
            const neededAchievements = Math.max(1, 3 - rowTeams.length);
            const selectedRowAchievements = achievements.length > 0 ? sample(achievements, neededAchievements) : [];
            
            rowCriteria = [
              ...rowTeams.map(team => ({
                label: team,
                type: "team",
                value: team,
              })),
              ...selectedRowAchievements.map(achievement => ({
                label: achievement,
                type: "achievement",
                value: achievement,
              }))
            ];
            
            // Ensure we always have exactly 3 row criteria
            while (rowCriteria.length < 3 && achievements.length > 0) {
              const extraAchievement = sample(achievements.filter(a => !rowCriteria.some(r => r.value === a)), 1)[0];
              if (extraAchievement) {
                rowCriteria.push({
                  label: extraAchievement,
                  type: "achievement",
                  value: extraAchievement,
                });
              } else {
                break;
              }
            }
          }
        }

        const correctAnswers = buildCorrectAnswers(players, columnCriteria, rowCriteria);
        
        // Log successful grid generation
        if (attempt === 0) {
          console.log("Generated grid with criteria:");
          console.log("Columns:", columnCriteria.map(c => `${c.label} (${c.type})`));
          console.log("Rows:", rowCriteria.map(r => `${r.label} (${r.type})`));
        }

        if (gridIsValid(correctAnswers)) {
          const gameData = insertGameSchema.parse({
            columnCriteria,
            rowCriteria,
            correctAnswers,
          });

          const newGame = await storage.createGame(gameData);
          return res.json(newGame);
        }
      }

      // If no valid grid after 200 tries, try a simpler approach
      console.log(`Failed to generate grid after 200 attempts. Teams: ${teams.length}, Achievements: ${achievements.length}`);
      
      // Fallback: Simple team-only grid if we have enough teams
      if (teams.length >= 6) {
        const selectedTeams = sample(teams, 6);
        const columnCriteria = selectedTeams.slice(0, 3).map(team => ({
          label: team,
          type: "team" as const,
          value: team,
        }));
        const rowCriteria = selectedTeams.slice(3, 6).map(team => ({
          label: team,
          type: "team" as const,
          value: team,
        }));
        
        const correctAnswers = buildCorrectAnswers(players, columnCriteria, rowCriteria);
        
        if (Object.values(correctAnswers).every(list => list && list.length > 0)) {
          const gameData = insertGameSchema.parse({
            columnCriteria,
            rowCriteria,
            correctAnswers,
          });

          const newGame = await storage.createGame(gameData);
          return res.json(newGame);
        }
      }
      
      res.status(400).json({ 
        message: `Couldn't generate a valid grid. Available teams: ${teams.length}, available achievements: ${achievements.length}. Dataset may need more variety.` 
      });

    } catch (error: any) {
      console.error("Generate game error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to generate game" 
      });
    }
  });

  // Get a specific game by ID
  app.get("/api/games/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const game = await storage.getGame(id);
      
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      
      res.json(game);
    } catch (error) {
      console.error("Get game error:", error);
      res.status(500).json({ message: "Failed to retrieve game" });
    }
  });

  // Search players
  app.get("/api/players/search", async (req, res) => {
    try {
      const { q } = searchQuerySchema.parse(req.query);
      const players = await storage.searchPlayers(q);
      res.json(players);
    } catch (error) {
      res.status(400).json({ message: "Invalid search query" });
    }
  });

  // Get top players for a cell (for "Other Top Answers" section)
  app.get("/api/players/top-for-cell", async (req, res) => {
    try {
      const { columnCriteria, rowCriteria, excludePlayer } = req.query;
      const players = await storage.getPlayers();
      
      if (!columnCriteria || !rowCriteria) {
        return res.status(400).json({ message: "Column and row criteria required" });
      }

      // Parse criteria from query strings
      const colCriteria = JSON.parse(columnCriteria as string);
      const rowCriteria_item = JSON.parse(rowCriteria as string);
      
      let eligiblePlayers: any[] = [];
      
      if (colCriteria.type === "team" && rowCriteria_item.type === "team") {
        // Both are teams - find players who played for both teams
        eligiblePlayers = players.filter(p => 
          p.teams.includes(colCriteria.value) && 
          p.teams.includes(rowCriteria_item.value)
        );
      } else if (colCriteria.type === "team" && rowCriteria_item.type === "achievement") {
        // Team x Achievement - find players who played for team AND have achievement
        eligiblePlayers = players.filter(p => 
          p.teams.includes(colCriteria.value) && 
          p.achievements.includes(rowCriteria_item.value)
        );
      } else if (colCriteria.type === "achievement" && rowCriteria_item.type === "team") {
        // Achievement x Team - find players who have achievement AND played for team
        eligiblePlayers = players.filter(p => 
          p.achievements.includes(colCriteria.value) && 
          p.teams.includes(rowCriteria_item.value)
        );
      }
      
      // Sort by career win shares descending and exclude the current player
      const topPlayers = eligiblePlayers
        .filter(p => p.name !== excludePlayer)
        .sort((a, b) => (b.careerWinShares || 0) - (a.careerWinShares || 0))
        .slice(0, 10)
        .map(p => ({ name: p.name, teams: p.teams }));
      
      res.json(topPlayers);
    } catch (error) {
      console.error("Get top players error:", error);
      res.status(500).json({ message: "Failed to get top players" });
    }
  });

  // Debug endpoint to check player matches for specific criteria
  
app.get("/api/debug/matches", async (req, res) => {
    try {
      const { team, team2, achievement } = req.query;
      
      const players = await storage.getPlayers();
      let matches;
      
      if (team && team2) {
        // Team-to-team criteria
        matches = players.filter(player =>
          player.teams.includes(team as string) &&
          player.teams.includes(team2 as string)
        );
      } else if (team && achievement) {
        // Team-to-achievement criteria
        matches = players.filter(player =>
          player.teams.includes(team as string) &&
          player.achievements.includes(achievement as string)
        );
      } else {
        return res.status(400).json({ message: "Need either team+achievement or team+team2 parameters" });
      }
      
      // Sort by career win shares descending
      matches.sort((a, b) => (b.careerWinShares || 0) - (a.careerWinShares || 0));
      
      res.json({ players: matches });
    } catch (error) {
      res.status(500).json({ message: "Debug query failed" });
    }
  });

  // Get session statistics (must come before /:id route)
  app.get("/api/sessions/stats", async (req, res) => {
    try {
      const sessions = await storage.getGameSessions();
      const completedSessions = sessions.filter(s => s.completed);
      
      const stats = {
        gridsCompleted: completedSessions.length,
        averageScore: completedSessions.length > 0 
          ? Math.round((completedSessions.reduce((sum, s) => sum + s.score, 0) / completedSessions.length) * 10) / 10
          : 0,
        bestScore: completedSessions.length > 0 
          ? Math.max(...completedSessions.map(s => s.score))
          : 0,
        successRate: completedSessions.length > 0
          ? Math.round((completedSessions.reduce((sum, s) => sum + s.score, 0) / (completedSessions.length * 9)) * 100)
          : 0
      };

      res.json(stats);
    } catch (error) {
      console.error("Get session stats error:", error);
      res.status(500).json({ message: "Failed to retrieve session stats" });
    }
  });

  // Get a specific session by ID
  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const session = await storage.getGameSession(id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      res.json(session);
    } catch (error) {
      console.error("Get session error:", error);
      res.status(500).json({ message: "Failed to retrieve session" });
    }
  });

  // Create a new game session
  app.post("/api/sessions", async (req, res) => {
    try {
      const sessionData = insertGameSessionSchema.parse(req.body);
      const session = await storage.createGameSession(sessionData);
      res.json(session);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid session data" });
    }
  });

  // Submit an answer
  app.post("/api/sessions/:id/answer", async (req, res) => {
    try {
      const { id } = req.params;
      const { row, col, player } = answerSchema.parse(req.body);
      
      const session = await storage.getGameSession(id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const game = await storage.getGame(session.gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      const cellKey = `${row}_${col}`;
      const correctPlayers = game.correctAnswers[cellKey] || [];
      const isCorrect = correctPlayers.some(p => p.toLowerCase() === player.toLowerCase());
      
      // Debug logging for answer validation
      console.log(`DEBUG: Answer validation for "${player}"`);
      console.log(`Cell (${row}_${col}) criteria: Column=${game.columnCriteria[col]?.label}, Row=${game.rowCriteria[row]?.label}`);
      console.log(`Expected players for this cell:`, correctPlayers.slice(0, 5)); // Show first 5
      console.log(`Player match found: ${isCorrect}`);
      


      // Calculate proper rarity using new prominence system
      const players = await storage.getPlayers();
      const eligiblePlayers = players.filter(p => 
        correctPlayers.some(correctName => correctName.toLowerCase() === p.name.toLowerCase())
      );
      
      // Import new rarity calculation
      let rarityPercent = 50;
      let playerRank = 1;
      let eligibleCount = eligiblePlayers.length;
      
      try {
        const { computeCellRarity } = await import('./logic/cellRarity');
        const { rarityMap, rankMap, eligibleCount: totalEligible } = computeCellRarity(eligiblePlayers);
        
        // Find the guessed player's pid
        const guessedPlayer = eligiblePlayers.find(p => p.name.toLowerCase() === player.toLowerCase());
        if (guessedPlayer && guessedPlayer.pid) {
          rarityPercent = rarityMap.get(guessedPlayer.pid) || 50;
          playerRank = rankMap.get(guessedPlayer.pid) || 1;
          eligibleCount = totalEligible;
        }
        
        // Debug logging
        console.log(`DEBUG: Rarity calculation for "${player}"`);
        console.log(`Eligible players count: ${eligibleCount}`);
        console.log(`Calculated rarity: ${rarityPercent}, rank: ${playerRank}`);
        
      } catch (error) {
        console.error('Rarity calculation error:', error);
        // Fallback to simple calculation
        const foundPlayer = players.find(p => p.name.toLowerCase() === player.toLowerCase());
        const playerQuality = foundPlayer?.quality || 50;
        rarityPercent = Math.round(0.5 * playerQuality + 0.5 * (100 / Math.min(20, correctPlayers.length)));
      }

      // Get player quality for session storage
      const foundPlayer = players.find(p => p.name.toLowerCase() === player.toLowerCase());
      const playerQuality = foundPlayer?.quality || 50;

      // Update session with the answer
      const updatedAnswers = {
        ...session.answers,
        [cellKey]: { 
          player, 
          correct: isCorrect, 
          quality: playerQuality, 
          rarity: rarityPercent,
          rank: playerRank,
          eligibleCount
        }
      };

      const newScore = session.score + (isCorrect ? 1 : 0);
      const totalAnswers = Object.keys(updatedAnswers).length;
      const isCompleted = totalAnswers === 9;

      const updatedSession = await storage.updateGameSession(id, {
        answers: updatedAnswers,
        score: newScore,
        completed: isCompleted
      });

      // Sort correct players by win shares (descending) when showing them
      let sortedCorrectPlayers = correctPlayers;
      if (!isCorrect && correctPlayers.length > 0) {
        // Get full player data for sorting
        const playerData = await Promise.all(
          correctPlayers.map(async (playerName: string) => {
            const players = await storage.searchPlayers(playerName);
            return players.find(p => p.name === playerName);
          })
        );
        
        // Sort by career win shares (descending) and extract names
        sortedCorrectPlayers = playerData
          .filter(Boolean) // Remove any null/undefined results
          .sort((a, b) => (b?.careerWinShares || 0) - (a?.careerWinShares || 0))
          .map(p => p!.name);
      }

      res.json({
        session: updatedSession,
        isCorrect,
        correctPlayers: isCorrect ? [] : sortedCorrectPlayers // Show sorted correct players when wrong
      });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid answer data" });
    }
  });



  const httpServer = createServer(app);
  return httpServer;
}
