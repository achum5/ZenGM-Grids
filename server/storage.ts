import { type Player, type Game, type GameSession, type DailyPickFrequency, type InsertPlayer, type InsertGame, type InsertGameSession, perGuessScore } from "@shared/schema";
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
  updateGame(id: string, updates: Partial<Game>): Promise<Game | undefined>;
  getGameBySeed(seed: string): Promise<Game | undefined>;
  
  // Game session operations
  createGameSession(session: InsertGameSession): Promise<GameSession>;
  updateGameSession(id: string, updates: Partial<GameSession>): Promise<GameSession | undefined>;
  getGameSession(id: string): Promise<GameSession | undefined>;
  getGameSessions(): Promise<GameSession[]>;
  
  // Pick frequency operations per spec point 5
  recordPickFrequency(playerName: string, cellKey: string): Promise<void>;
  getPickFrequencies(cellKey: string): Promise<DailyPickFrequency[]>;
  
  // Clear operations
  clearPlayers(): Promise<void>;
}

export class MemStorage implements IStorage {
  private players: Map<string, Player>;
  private games: Map<string, Game>;
  private gameSessions: Map<string, GameSession>;
  private dailyPickFrequencies: Map<string, DailyPickFrequency>;

  constructor() {
    this.players = new Map();
    this.games = new Map();
    this.gameSessions = new Map();
    this.dailyPickFrequencies = new Map();
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
        
        // Direct match
        if (normalizedName.includes(normalizedQuery)) {
          return true;
        }
        
        // Enhanced search for abbreviated names (e.g., "CJ L" should match "C.J. Lewis")
        const queryParts = normalizedQuery.split(/\s+/);
        const nameParts = normalizedName.split(/\s+/);
        
        // Check if all query parts can be matched to name parts
        return queryParts.every(queryPart => {
          return nameParts.some(namePart => {
            // Direct substring match
            if (namePart.includes(queryPart)) return true;
            
            // Check if query part matches initials (e.g., "cj" matches "c.j.")
            const queryLetters = queryPart.replace(/[^a-z]/g, '');
            const nameLetters = namePart.replace(/[^a-z]/g, '');
            
            if (queryLetters.length > 0 && nameLetters.length > 0) {
              // Check if name starts with the query letters
              return nameLetters.startsWith(queryLetters);
            }
            
            return false;
          });
        });
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
      seed: insertGame.seed || null,
      isShared: insertGame.isShared || false,
      shareableUrl: insertGame.shareableUrl || null,
      createdAt: new Date().toISOString()
    };
    this.games.set(id, game);
    return game;
  }

  async getGame(id: string): Promise<Game | undefined> {
    return this.games.get(id);
  }

  async updateGame(id: string, updates: Partial<Game>): Promise<Game | undefined> {
    const existing = this.games.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.games.set(id, updated);
    return updated;
  }

  async getGameBySeed(seed: string): Promise<Game | undefined> {
    return Array.from(this.games.values()).find(game => game.seed === seed);
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
            rank: typeof existing.rank === 'number' ? existing.rank : 0,
            eligibleCount: typeof existing.eligibleCount === 'number' ? existing.eligibleCount : 0,
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

  // Pick frequency operations per spec point 5
  async recordPickFrequency(playerName: string, cellKey: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const key = `${cellKey}_${playerName}_${today}`;
    
    const existing = this.dailyPickFrequencies.get(key);
    if (existing) {
      // Increment count
      existing.pickCount += 1;
      this.dailyPickFrequencies.set(key, existing);
    } else {
      // Create new record
      const frequency: DailyPickFrequency = {
        id: randomUUID(),
        playerName,
        cellKey,
        pickCount: 1,
        date: today
      };
      this.dailyPickFrequencies.set(key, frequency);
    }
  }

  async getPickFrequencies(cellKey: string): Promise<DailyPickFrequency[]> {
    const today = new Date().toISOString().split('T')[0];
    return Array.from(this.dailyPickFrequencies.values())
      .filter(freq => freq.cellKey === cellKey && freq.date === today);
  }

  async clearPlayers(): Promise<void> {
    this.players.clear();
  }
}

export const storage = new MemStorage();
