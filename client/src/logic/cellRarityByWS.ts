// src/logic/cellRarityByWS.ts
import { computeCellRarityByWS } from "../utils/rarityWS";

// Optionally add a cache Map<cellKey, { rarityMap, rankMap, wsMap, eligibleCount }>
const cache = new Map<string, any>();

export function buildCellRarityMaps(cellKey: string, eligiblePlayers: any[]) {
  if (cache.has(cellKey)) return cache.get(cellKey);
  const maps = computeCellRarityByWS(eligiblePlayers);
  cache.set(cellKey, maps);
  return maps;
}

// If grids can change during play, export a way to clear just that cellKey.
export function resetCellRarity(cellKey: string) {
  cache.delete(cellKey);
}