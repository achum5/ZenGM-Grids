// src/logic/cellRarity.ts
import { rarityScoresForEligible } from "../utils/rarity";
import { toPlayerCareerRS } from "../utils/careerAdapter";

export function computeCellRarity(eligiblePlayers: any[]) {
  if (eligiblePlayers.length < 2) {
    // Edge case: if fewer than 2 eligible players, set rarity to 50 by default
    const map = new Map<number, { rarity: number; rank: number }>();
    eligiblePlayers.forEach(player => {
      const pid = player.pid || Math.random();
      map.set(pid, { rarity: 50, rank: 1 });
    });
    return map;
  }

  const careers = eligiblePlayers.map(toPlayerCareerRS);
  const scores = rarityScoresForEligible(careers);
  
  // Sort by rarity descending to assign ranks
  const sortedScores = [...scores].sort((a, b) => b.rarity - a.rarity);
  
  const map = new Map<number, { rarity: number; rank: number }>();
  scores.forEach(s => {
    const rank = sortedScores.findIndex(sorted => sorted.pid === s.pid) + 1;
    map.set(s.pid, { rarity: s.rarity, rank });
  });
  
  return map;
}

// Cache for cell rarity computations
const cellRarityCache = new Map<string, Map<number, { rarity: number; rank: number }>>();

export function getCellRarityWithCache(cellKey: string, eligiblePlayers: any[]) {
  if (!cellRarityCache.has(cellKey)) {
    cellRarityCache.set(cellKey, computeCellRarity(eligiblePlayers));
  }
  return cellRarityCache.get(cellKey)!;
}

export function clearCellRarityCache() {
  cellRarityCache.clear();
}