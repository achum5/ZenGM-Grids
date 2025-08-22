// logic/cellRarity.ts
import { rarityScoresForEligible } from "../utils/rarity";
import { toPlayerCareerRS } from "../utils/careerAdapter";

export function computeCellRarity(eligiblePlayers: any[]) {
  const careers = eligiblePlayers.map(toPlayerCareerRS);
  const scores = rarityScoresForEligible(careers);

  // Debug logging to confirm prominence range
  const proms = scores.map(s => s.prom);
  const min = Math.min(...proms);
  const max = Math.max(...proms);
  const range = max - min;
  console.log(`DEBUG: Cell rarity - ${eligiblePlayers.length} eligible, promRange=[${min.toFixed(2)}, ${max.toFixed(2)}], range=${range.toFixed(2)}`);

  // Build rarity + rank maps (rank 1 = most common = lowest rarity)
  const byRarityAsc = [...scores].sort((a, b) => a.rarity - b.rarity);
  const rankMap = new Map<number, number>();
  byRarityAsc.forEach((s, i) => rankMap.set(s.pid, i + 1)); // 1-based rank

  const rarityMap = new Map<number, number>();
  scores.forEach(s => rarityMap.set(s.pid, s.rarity));

  return { rarityMap, rankMap, eligibleCount: scores.length };
}