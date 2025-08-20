import { type Player, type Game, type GameSession, type InsertPlayer, type InsertGame, type InsertGameSession } from "@shared/schema";
import { randomUUID } from "crypto";

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
}

export class MemStorage implements IStorage {
  private players: Map<string, Player>;
  private games: Map<string, Game>;
  private gameSessions: Map<string, GameSession>;

  constructor() {
    this.players = new Map();
    this.games = new Map();
    this.gameSessions = new Map();
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const id = randomUUID();
    const player: Player = { 
      ...insertPlayer, 
      id,
      stats: insertPlayer.stats || null,
      face: insertPlayer.face || null,
      imageUrl: insertPlayer.imageUrl || null,
      careerWinShares: insertPlayer.careerWinShares || null,
      quality: insertPlayer.quality || null
    };
    this.players.set(id, player);
    return player;
  }

  async createPlayers(insertPlayers: InsertPlayer[]): Promise<Player[]> {
    const players: Player[] = [];
    for (const insertPlayer of insertPlayers) {
      const player = await this.createPlayer(insertPlayer);
      players.push(player);
    }
    return players;
  }

  async getPlayers(): Promise<Player[]> {
    return Array.from(this.players.values());
  }

  async searchPlayers(query: string): Promise<Player[]> {
    const normalizedQuery = this.normalizeString(query.toLowerCase());
    return Array.from(this.players.values())
      .filter(player => {
        const normalizedName = this.normalizeString(player.name.toLowerCase());
        return normalizedName.includes(normalizedQuery);
      })
      .slice(0, 10);
  }

  private normalizeString(str: string): string {
    // Remove diacritics (accents, tildes, etc.) for better search matching
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  async createGame(insertGame: InsertGame): Promise<Game> {
    const id = randomUUID();
    const game: Game = { 
      id,
      columnCriteria: [...insertGame.columnCriteria],
      rowCriteria: [...insertGame.rowCriteria],
      correctAnswers: Object.fromEntries(
        Object.entries(insertGame.correctAnswers).map(([key, value]) => [key, [...value]])
      ),
      createdAt: new Date().toISOString()
    };
    this.games.set(id, game);
    return game;
  }

  async getGame(id: string): Promise<Game | undefined> {
    return this.games.get(id);
  }

  async createGameSession(insertSession: InsertGameSession): Promise<GameSession> {
    const id = randomUUID();
    const session: GameSession = { 
      answers: {},
      score: 0,
      completed: false,
      ...insertSession, 
      id,
      createdAt: new Date().toISOString()
    };
    this.gameSessions.set(id, session);
    return session;
  }

  async updateGameSession(id: string, updates: Partial<GameSession>): Promise<GameSession | undefined> {
    const session = this.gameSessions.get(id);
    if (!session) return undefined;
    
    const updatedSession = { ...session, ...updates };
    
    // Fix type issues with answers
    if (updates.answers) {
      updatedSession.answers = Object.fromEntries(
        Object.entries(updates.answers).map(([key, existing]) => [
          key, {
            player: existing.player,
            correct: existing.correct,
            rarity: typeof existing.rarity === 'number' ? existing.rarity : 0,
            quality: typeof existing.quality === 'number' ? existing.quality : 0,
          }
        ])
      );
    }
    
    this.gameSessions.set(id, updatedSession);
    return updatedSession;
  }

  async getGameSession(id: string): Promise<GameSession | undefined> {
    return this.gameSessions.get(id);
  }

  async getGameSessions(): Promise<GameSession[]> {
    return Array.from(this.gameSessions.values());
  }

  async clearPlayers(): Promise<void> {
    this.players.clear();
  }
}

export const storage = new MemStorage();
