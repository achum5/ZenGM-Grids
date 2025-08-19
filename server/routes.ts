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
        let rawPlayers = Array.isArray(data) ? data : data.players || [];
        
        // Transform raw player data to our format with defaults
        players = rawPlayers.map((player: any) => ({
          name: player.name || (player.firstName && player.lastName ? `${player.firstName} ${player.lastName}` : "Unknown Player"),
          teams: player.teams || (player.tid !== undefined ? [`Team ${player.tid}`] : []),
          years: player.years || [],
          achievements: player.achievements || [],
          stats: player.stats || player.ratings || undefined
        }));
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

      // Validate and create players with better error handling
      const validatedPlayers: any[] = [];
      const errors: string[] = [];
      
      for (let i = 0; i < players.length; i++) {
        try {
          const validatedPlayer = insertPlayerSchema.parse(players[i]);
          validatedPlayers.push(validatedPlayer);
        } catch (error) {
          errors.push(`Player ${i + 1}: ${error instanceof Error ? error.message : 'Validation failed'}`);
          // Skip invalid players but continue processing
          continue;
        }
      }
      
      if (validatedPlayers.length === 0) {
        return res.status(400).json({ 
          message: "No valid players found in file", 
          errors: errors.slice(0, 5) // Show first 5 errors
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
