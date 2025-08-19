import { type Player, type Game, type GameSession, type UploadedFile, type InsertPlayer, type InsertGame, type InsertGameSession, type InsertUploadedFile } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { players, games, gameSessions, uploadedFiles } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Player operations
  createPlayer(player: InsertPlayer): Promise<Player>;
  createPlayers(players: InsertPlayer[]): Promise<Player[]>;
  getPlayers(): Promise<Player[]>;
  searchPlayers(query: string): Promise<Player[]>;
  
  // Game operations
  createGame(game: InsertGame): Promise<Game>;
  getGame(id: string): Promise<Game | undefined>;
  
  // Game session operations
  createGameSession(session: InsertGameSession): Promise<GameSession>;
  updateGameSession(id: string, updates: Partial<GameSession>): Promise<GameSession | undefined>;
  getGameSession(id: string): Promise<GameSession | undefined>;
  getGameSessions(): Promise<GameSession[]>;
  
  // Clear operations
  clearPlayers(): Promise<void>;

  // File operations
  saveUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  getLastUploadedFile(): Promise<UploadedFile | undefined>;
}

export class DatabaseStorage implements IStorage {
  async saveUploadedFile(file: InsertUploadedFile): Promise<UploadedFile> {
    const [uploadedFile] = await db
      .insert(uploadedFiles)
      .values(file)
      .returning();
    return uploadedFile;
  }

  async getLastUploadedFile(): Promise<UploadedFile | undefined> {
    const [lastFile] = await db
      .select()
      .from(uploadedFiles)
      .orderBy(desc(uploadedFiles.uploadedAt))
      .limit(1);
    return lastFile || undefined;
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const [player] = await db
      .insert(players)
      .values(insertPlayer)
      .returning();
    return player;
  }

  async createPlayers(insertPlayers: InsertPlayer[]): Promise<Player[]> {
    const createdPlayers = await db
      .insert(players)
      .values(insertPlayers)
      .returning();
    return createdPlayers;
  }

  async getPlayers(): Promise<Player[]> {
    return await db.select().from(players);
  }

  async searchPlayers(query: string): Promise<Player[]> {
    if (!query) return await this.getPlayers();
    
    // Fallback to contains search using raw SQL
    const allPlayers = await this.getPlayers();
    return allPlayers.filter(player => 
      player.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  async createGame(insertGame: InsertGame): Promise<Game> {
    const [game] = await db
      .insert(games)
      .values(insertGame)
      .returning();
    return game;
  }

  async getGame(id: string): Promise<Game | undefined> {
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, id));
    return game || undefined;
  }

  async createGameSession(insertSession: InsertGameSession): Promise<GameSession> {
    const [session] = await db
      .insert(gameSessions)
      .values(insertSession)
      .returning();
    return session;
  }

  async updateGameSession(id: string, updates: Partial<GameSession>): Promise<GameSession | undefined> {
    const [session] = await db
      .update(gameSessions)
      .set(updates)
      .where(eq(gameSessions.id, id))
      .returning();
    return session || undefined;
  }

  async getGameSession(id: string): Promise<GameSession | undefined> {
    const [session] = await db
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, id));
    return session || undefined;
  }

  async getGameSessions(): Promise<GameSession[]> {
    return await db.select().from(gameSessions);
  }

  async clearPlayers(): Promise<void> {
    await db.delete(players);
  }
}

export const storage = new DatabaseStorage();
