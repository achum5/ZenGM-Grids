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
  return Object.values(ca).every(list => list && list.length > 0);
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
  
  // Upload league file and parse players
  app.post("/api/upload", upload.single("file"), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      let fileBuffer = req.file.buffer;
      let fileContent: string;
      
      // Check if file is gzipped
      const isGzipped = req.file.mimetype === "application/gzip" || 
                       req.file.originalname?.endsWith(".gz") ||
                       req.file.originalname?.endsWith(".gzip");
      
      if (isGzipped) {
        try {
          fileBuffer = await gunzipAsync(fileBuffer);
        } catch (error) {
          return res.status(400).json({ message: "Failed to decompress gzip file" });
        }
      }
      
      fileContent = fileBuffer.toString();
      let players: any[] = [];

      const isJson = req.file.mimetype === "application/json" || 
                    req.file.originalname?.includes(".json") ||
                    (isGzipped && req.file.originalname?.includes(".json"));

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

          // Add career milestone achievements based on Immaculate Grid rules
          if (careerStats.points >= 20000) achievements.push("20000+ Points");
          if (careerStats.rebounds >= 10000) achievements.push("10000+ Rebounds");
          if (careerStats.assists >= 5000) achievements.push("5000+ Assists");

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
              const bpg = (season.blk || 0);
              const spg = (season.stl || 0);
              
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
          
          // Process awards from BBGM data with Immaculate Grid mappings
          if (player.awards && Array.isArray(player.awards)) {
            player.awards.forEach((award: any) => {
              if (award.type) {
                switch (award.type) {
                  case "Champion":
                    achievements.push("League Champ");
                    break;
                  case "Finals MVP":
                    achievements.push("Finals MVP");
                    break;
                  case "MVP":
                    achievements.push("MVP");
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
                    achievements.push("All Star");
                    break;
                  case "All-League":
                    achievements.push("All-NBA");
                    break;
                  case "All-Rookie":
                    achievements.push("All-Rookie Team");
                    break;
                }
              }
            });
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

          return {
            name,
            teams: Array.from(allTeams),
            years,
            achievements,
            stats: player.ratings || player.stats || undefined,
            face: player.face || null,
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
  });

  // Generate a new game grid
  app.post("/api/games/generate", async (req, res) => {
    try {
      const players = await storage.getPlayers();
      if (players.length === 0) {
        return res.status(400).json({ 
          message: "No players data available. Please upload a league file first." 
        });
      }

      // Get unique teams and achievements (prioritize Immaculate Grid criteria)
      const teams = Array.from(new Set(players.flatMap(p => p.teams)));
      const allAchievements = Array.from(new Set(players.flatMap(p => p.achievements)));
      
      // Priority achievements for Immaculate Grid (most common and interesting combinations)
      const priorityAchievements = [
        "All Star",
        "MVP", 
        "Finals MVP",
        "Rookie of the Year",
        "Defensive Player of the Year",
        "All-NBA",
        "All-Rookie Team",
        "League Champ",
        "Hall of Fame",
        "20+ Points Per Game",
        "10+ Rebounds Per Game", 
        "5+ Assists Per Game",
        "20000+ Points",
        "10000+ Rebounds",
        "5000+ Assists",
        "First Round Draft Pick",
        "Undrafted",
        "Only One Team",
        "Born Outside US 50 States and DC"
      ];
      
      // Use priority achievements that exist in our dataset
      const achievements = priorityAchievements.filter(ach => 
        allAchievements.includes(ach) && 
        players.filter(p => p.achievements.includes(ach)).length >= 3 // At least 3 players
      );

      if (teams.length < 3) {
        return res.status(400).json({ 
          message: "Not enough data to generate a grid. Need at least 3 teams." 
        });
      }

      // Loop up to 200 attempts to find a valid grid
      for (let attempt = 0; attempt < 200; attempt++) {
        let columnCriteria: GridCriteria[] = [];
        let rowCriteria: GridCriteria[] = [];
        
        // Decide between team-only grid (3x3 teams) or mixed grid (3 teams x 2 teams + 1 achievement)
        const useTeamOnlyGrid = Math.random() < 0.5 && teams.length >= 6; // 50% chance if we have enough teams
        
        if (useTeamOnlyGrid) {
          // 3 teams x 3 teams grid
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
        } else {
          // 3 teams x (2 teams + 1 achievement) grid
          const selectedTeams = sample(teams, 5);
          columnCriteria = selectedTeams.slice(0, 3).map(team => ({
            label: team,
            type: "team",
            value: team,
          }));
          
          // For rows: 2 teams + 1 achievement
          const rowTeams = selectedTeams.slice(3, 5);
          const selectedAchievements = achievements.length > 0 ? sample(achievements, 1) : ['Hall of Fame'];
          
          rowCriteria = [
            ...rowTeams.map(team => ({
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
        }

        const correctAnswers = buildCorrectAnswers(players, columnCriteria, rowCriteria);

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

      // If no valid grid after 200 tries
      res.status(400).json({ 
        message: "Couldn't generate a valid grid from this dataset. Try another league or add more seasons." 
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
      


      // Get player quality for rarity scoring
      const players = await storage.getPlayers();
      const foundPlayer = players.find(p => p.name.toLowerCase() === player.toLowerCase());
      const playerQuality = foundPlayer?.quality || 50;
      
      // Calculate rarity percentage (combines quality with cell scarcity)
      const candidateCount = correctPlayers.length;
      const rarityPercent = Math.round(0.5 * playerQuality + 0.5 * (100 / Math.min(20, candidateCount)));

      // Update session with the answer
      const updatedAnswers = {
        ...session.answers,
        [cellKey]: { player, correct: isCorrect, quality: playerQuality, rarity: rarityPercent }
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
