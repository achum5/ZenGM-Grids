import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const players = pgTable("players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  pid: integer("pid"), // BBGM player ID for league achievement matching
  teams: jsonb("teams").$type<string[]>().notNull(),
  years: jsonb("years").$type<{ team: string; start: number; end: number }[]>().notNull(),
  achievements: jsonb("achievements").$type<string[]>().notNull(),
  stats: jsonb("stats").$type<Record<string, any>>(),
  face: jsonb("face").$type<Record<string, any>>(),
  imageUrl: text("image_url"),
  careerWinShares: integer("career_win_shares").default(0),
  quality: integer("quality").default(50),
});

export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  columnCriteria: jsonb("column_criteria").$type<{ label: string; type: string; value: string }[]>().notNull(),
  rowCriteria: jsonb("row_criteria").$type<{ label: string; type: string; value: string }[]>().notNull(),
  correctAnswers: jsonb("correct_answers").$type<{ [key: string]: string[] }>().notNull(),
  createdAt: text("created_at").notNull().default(sql`NOW()`),
});

export const gameSessions = pgTable("game_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id),
  answers: jsonb("answers").$type<{ [key: string]: { player: string; correct: boolean; quality?: number; rarity?: number; rank?: number; eligibleCount?: number } }>().notNull().default({}),
  score: integer("score").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`NOW()`),
});

export const uploadedFiles = pgTable("uploaded_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  fileContent: text("file_content").notNull(), // Store the raw file content
  uploadedAt: text("uploaded_at").notNull().default(sql`NOW()`),
  playerCount: integer("player_count").notNull().default(0),
  teamCount: integer("team_count").notNull().default(0),
  achievementCount: integer("achievement_count").notNull().default(0),
});

export const insertPlayerSchema = z.object({
  name: z.string().min(1),
  pid: z.number().nullable().optional(), // BBGM player ID for league achievement matching
  teams: z.array(z.string()).default([]),
  years: z.array(z.object({
    team: z.string(),
    start: z.number(),
    end: z.number()
  })).default([]),
  achievements: z.array(z.string()).default([]),
  stats: z.union([z.record(z.any()), z.array(z.any())]).optional(),
  face: z.record(z.any()).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  careerWinShares: z.number().default(0),
  quality: z.number().default(50),
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  createdAt: true,
});

export const insertGameSessionSchema = createInsertSchema(gameSessions).omit({
  id: true,
  createdAt: true,
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  uploadedAt: true,
});

export type Player = typeof players.$inferSelect;
export type Game = typeof games.$inferSelect;
export type GameSession = typeof gameSessions.$inferSelect;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;

// Types for frontend
export interface GridCriteria {
  label: string;
  type: string;
  value: string;
}

export interface TeamInfo {
  name: string;
  abbrev?: string;
  logo?: string;
}

export interface FileUploadData {
  players: InsertPlayer[];
  teams: TeamInfo[];
  achievements: string[];
}

export interface GridCell {
  row: number;
  col: number;
  player?: string;
  correct?: boolean;
}

export interface SessionStats {
  gridsCompleted: number;
  averageScore: number;
  bestScore: number;
  successRate: number;
}

// New canonical BBGM types
export type Team = {
  tid: number;          // BBGM team ID
  abbrev: string;
  name: string;         // "Region Name" concatenated
};

export type SeasonLine = {
  season: number;
  tid: number;          // team ID for that season (regular season only)
  gp: number;           // games played (RS)
  pts: number; ast: number; stl: number; blk: number; tp: number; // totals
  fga: number; fta: number; tpa: number;                          // attempts
  fgp?: number; ftp?: number; tpp?: number;                        // percentages if present
  r_orb: number; r_drb: number;                                    // to derive TRB = ORB+DRB
  mp?: number;                                                     // total minutes (if present)
};

export type Award = {
  season: number;
  type: string;   // long names like "Most Valuable Player", "First Team All-League", "Won Championship"
};

export type Draft = {
  year?: number;
  round?: number;   // 1, 2, or undefined (undrafted)
  pick?: number;    // 1 .. N, undefined if undrafted
};

export type BBGMPlayer = {
  pid: number;
  name: string;
  bornYear?: number;
  awards: Award[];
  seasons: SeasonLine[];         // derived from p.stats where playoffs === false
  teamsPlayed: Set<number>;      // derived from seasons and statsTids
  career: {                      // RS only
    gp: number; pts: number; ast: number; stl: number; blk: number; tp: number; trb: number;
    fga: number; fta: number; tpa: number;
  };
  draft: Draft;
  hof?: boolean;
  gameHighs?: {                  // if available from export
    pts?: number;
    trb?: number;
    ast?: number;
    tp?: number;
  };
};

export type LeagueData = {
  players: BBGMPlayer[];
  teams: Team[];
  minSeason?: number;
  maxSeason?: number;
};
