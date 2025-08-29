import type { Player } from "@shared/schema";

export type LeagueForInput = { 
  players: Player[];
  teams?: string[];
  [k: string]: any;
};

export function buildGenerateInput(league: LeagueForInput, opts: any = {}) {
  // Build input exactly like the server route does
  const input = { players: league.players };
  
  // Defensive defaults so .includes never runs on undefined
  for (const k of Object.keys(input)) {
    const v = (input as any)[k];
    if (Array.isArray(v)) {
      // Ensure all player objects have non-undefined arrays
      if (k === 'players') {
        (input as any)[k] = v.map((player: any) => ({
          ...player,
          teams: player.teams || [],
          achievements: player.achievements || [],
          years: player.years || []
        }));
      }
    }
  }
  
  return input;
}