import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const players = pgTable("players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  teams: jsonb("teams").$type<string[]>().notNull(),
  years: jsonb("years").$type<{ team: string; start: number; end: number }[]>().notNull(),
  achievements: jsonb("achievements").$type<string[]>().notNull(),
  stats: jsonb("stats").$type<Record<string, any>>(),
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
  answers: jsonb("answers").$type<{ [key: string]: { player: string; correct: boolean } }>().notNull().default({}),
  score: integer("score").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`NOW()`),
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
}).extend({
  teams: z.array(z.string()).default([]),
  years: z.array(z.object({
    team: z.string(),
    start: z.number(),
    end: z.number()
  })).default([]),
  achievements: z.array(z.string()).default([]),
  stats: z.record(z.any()).optional(),
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  createdAt: true,
});

export const insertGameSessionSchema = createInsertSchema(gameSessions).omit({
  id: true,
  createdAt: true,
});

export type Player = typeof players.$inferSelect;
export type Game = typeof games.$inferSelect;
export type GameSession = typeof gameSessions.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;

// Types for frontend
export interface GridCriteria {
  label: string;
  type: string;
  value: string;
}

export interface FileUploadData {
  players: InsertPlayer[];
  teams: string[];
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
