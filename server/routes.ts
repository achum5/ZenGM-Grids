import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import csv from "csv-parser";
import { z } from "zod";
import { gunzip } from "zlib";
import { promisify } from "util";
import { insertPlayerSchema, insertGameSchema, insertGameSessionSchema, type FileUploadData, type GridCriteria } from "@shared/schema";

const gunzipAsync = promisify(gunzip);

interface MulterRequest extends Request {
  file?: multer.File;
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
      
      const isCsv = req.file.mimetype === "text/csv" || 
                   req.file.originalname?.includes(".csv") ||
                   (isGzipped && req.file.originalname?.includes(".csv"));

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
        }).filter(p => p.name !== "Unknown Player"); // Only include players with valid names
      } else if (isCsv) {
        // Parse CSV
        const results: any[] = [];
        const csvStream = require("stream").Readable.from([fileContent]);
        
        await new Promise((resolve, reject) => {
          csvStream
            .pipe(csv())
            .on("data", (data: any) => results.push(data))
            .on("end", resolve)
            .on("error", reject);
        });

        // Transform CSV data to player format
        players = results.map(row => ({
          name: row.name || row.Name || "Unknown Player",
          teams: (row.teams || row.Teams || "").split(",").map((t: string) => t.trim()).filter(Boolean),
          years: [],
          achievements: (row.achievements || row.Achievements || "").split(",").map((a: string) => a.trim()).filter(Boolean),
          stats: {}
        }));
      } else {
        return res.status(400).json({ message: "Unsupported file format. Please upload CSV, JSON, or gzipped files." });
      }

      console.log(`Parsed ${players.length} players from file`);
      if (players.length > 0) {
        console.log("Sample player:", JSON.stringify(players[0], null, 2));
      }

      // Validate and create players with better error handling
      const validatedPlayers: any[] = [];
      const errors: string[] = [];
      
      for (let i = 0; i < Math.min(players.length, 100); i++) { // Limit to first 100 for performance
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
          errors.push(`Player ${i + 1} (${players[i]?.name || 'unnamed'}): ${errorMsg}`);
          if (i < 5) { // Only log first 5 errors to avoid spam
            console.log(`Validation error for player ${i + 1}:`, errorMsg, JSON.stringify(players[i], null, 2));
          }
          // Skip invalid players but continue processing
          continue;
        }
      }
      
      console.log(`Successfully validated ${validatedPlayers.length} out of ${players.length} players`);
      
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
        players: createdPlayers,
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
        return res.status(400).json({ message: "No players data available. Please upload a league file first." });
      }

      // Get unique teams and achievements
      const teams = Array.from(new Set(players.flatMap(p => p.teams)));
      const achievements = Array.from(new Set(players.flatMap(p => p.achievements)));

      if (teams.length < 3 || achievements.length < 3) {
        return res.status(400).json({ message: "Not enough data to generate a grid. Need at least 3 teams and 3 achievements." });
      }

      // Randomly select criteria
      const selectedTeams = teams.sort(() => 0.5 - Math.random()).slice(0, 3);
      const selectedAchievements = achievements.sort(() => 0.5 - Math.random()).slice(0, 3);

      const columnCriteria: GridCriteria[] = selectedTeams.map(team => ({
        label: team,
        type: "team",
        value: team
      }));

      const rowCriteria: GridCriteria[] = selectedAchievements.map(achievement => ({
        label: achievement,
        type: "achievement",
        value: achievement
      }));

      // Generate correct answers for each cell
      const correctAnswers: { [key: string]: string[] } = {};
      
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const cellKey = `${row},${col}`;
          const teamCriteria = columnCriteria[col];
          const achievementCriteria = rowCriteria[row];
          
          const validPlayers = players.filter(player =>
            player.teams.includes(teamCriteria.value) &&
            player.achievements.includes(achievementCriteria.value)
          );
          
          correctAnswers[cellKey] = validPlayers.map(p => p.name);
        }
      }

      const gameData = insertGameSchema.parse({
        columnCriteria,
        rowCriteria,
        correctAnswers
      });

      const game = await storage.createGame(gameData);
      res.json(game);
    } catch (error) {
      console.error("Generate game error:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to generate game" });
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

      const cellKey = `${row},${col}`;
      const correctPlayers = game.correctAnswers[cellKey] || [];
      const isCorrect = correctPlayers.some(p => p.toLowerCase() === player.toLowerCase());

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

  // Get session statistics
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
      res.status(500).json({ message: "Failed to get statistics" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
