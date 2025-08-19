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
        const teamMap = new Map<number, string>();
        if (data.teams && Array.isArray(data.teams)) {
          console.log(`Found ${data.teams.length} teams in BBGM file`);
          data.teams.forEach((team: any, index: number) => {
            if (team && team.region && team.name) {
              teamMap.set(index, `${team.region} ${team.name}`);
            }
          });
          console.log("Team mapping created:", Array.from(teamMap.entries()).slice(0, 5));
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
            const teamName = teamMap.get(player.tid) || `Team ${player.tid}`;
            teams.push(teamName);
          }
          
          // Also collect teams from stats history
          const allTeams = new Set(teams);
          if (player.stats && Array.isArray(player.stats)) {
            player.stats.forEach((stat: any) => {
              if (stat.tid !== undefined && stat.tid >= 0) {
                const teamName = teamMap.get(stat.tid) || `Team ${stat.tid}`;
                allTeams.add(teamName);
              }
            });
          }
          
          // Extract achievements from player data
          const achievements: string[] = [];
          if (player.awards && Array.isArray(player.awards)) {
            achievements.push(...player.awards.map((award: any) => award.type || 'Award'));
          }
          if (player.hof) achievements.push('Hall of Fame');
          if (player.retiredYear) achievements.push('Retired');
          
          // Extract career years and teams from statistics
          const years: { team: string; start: number; end: number }[] = [];
          if (player.stats && Array.isArray(player.stats)) {
            const teamYears = new Map<string, { start: number; end: number }>();
            player.stats.forEach((stat: any) => {
              if (stat.season && stat.tid !== undefined) {
                const teamName = teamMap.get(stat.tid) || `Team ${stat.tid}`;
                const existing = teamYears.get(teamName);
                if (existing) {
                  existing.start = Math.min(existing.start, stat.season);
                  existing.end = Math.max(existing.end, stat.season);
                } else {
                  teamYears.set(teamName, { start: stat.season, end: stat.season });
                }
              }
            });
            teamYears.forEach((yearRange, teamName) => {
              years.push({ team: teamName, ...yearRange });
            });
          }
          
          return {
            name,
            teams: Array.from(allTeams),
            years,
            achievements,
            stats: player.ratings || player.stats || undefined
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
            stats: players[i].stats
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
      
      // Clear existing players and add new ones
      await storage.clearPlayers();
      const createdPlayers = await storage.createPlayers(validatedPlayers);

      // Extract teams and achievements for frontend
      const teams = Array.from(new Set(createdPlayers.flatMap(p => p.teams)));
      const achievements = Array.from(new Set(createdPlayers.flatMap(p => p.achievements)));

      const result: FileUploadData = {
        players: createdPlayers.map(p => ({
          name: p.name,
          teams: p.teams,
          years: p.years,
          achievements: p.achievements,
          stats: p.stats || undefined
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

      // Get unique teams and achievements
      const teams = Array.from(new Set(players.flatMap(p => p.teams)));
      const achievements = Array.from(new Set(players.flatMap(p => p.achievements)));

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
      const { team, achievement } = req.query;
      if (!team || !achievement) {
        return res.status(400).json({ message: "Need both team and achievement parameters" });
      }
      
      const players = await storage.getPlayers();
      const matches = players.filter(player =>
        player.teams.includes(team as string) &&
        player.achievements.includes(achievement as string)
      );
      
      res.json({
        criteria: { team, achievement },
        totalPlayers: players.length,
        matchCount: matches.length,
        matches: matches.map(p => ({ name: p.name, teams: p.teams, achievements: p.achievements }))
      });
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
      


      // Update session with the answer
      const updatedAnswers = {
        ...session.answers,
        [cellKey]: { player, correct: isCorrect }
      };

      const newScore = session.score + (isCorrect ? 1 : 0);
      const totalAnswers = Object.keys(updatedAnswers).length;
      const isCompleted = totalAnswers === 9;

      const updatedSession = await storage.updateGameSession(id, {
        answers: updatedAnswers,
        score: newScore,
        completed: isCompleted
      });

      res.json({
        session: updatedSession,
        isCorrect,
        correctPlayers: isCorrect ? [] : correctPlayers // Only show correct answers if wrong
      });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid answer data" });
    }
  });



  const httpServer = createServer(app);
  return httpServer;
}
