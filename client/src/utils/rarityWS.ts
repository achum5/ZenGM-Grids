// src/utils/rarityWS.ts
export type LeaguePlayer = any; // your player shape from league JSON

/** Regular-season career Win Shares = sum(ows + dws) */
export function careerWS_RS(player: LeaguePlayer): number {
  const stats = (player.stats ?? []).filter((s: any) => !s?.playoffs); // treats 0/false/undefined as RS
  let ows = 0, dws = 0;
  for (const s of stats) {
    ows += Number(s?.ows ?? 0);
    dws += Number(s?.dws ?? 0);
  }
  const ws = ows + dws;
  return Number.isFinite(ws) ? ws : 0;
}

/**
 * Compute rarity maps per cell using WS.
 * Sort DESC by WS (highest first = most common).
 * Now rarity = reverse percentile (100 = most rare, 0 = most common)
 *   idx = 0..N-1 (0 = highest WS)
 *   rarity = round(100 * (1 - idx / (N - 1)))
 */
export function computeCellRarityByWS(eligiblePlayers: LeaguePlayer[]) {
  const arr = eligiblePlayers.map(p => ({ pid: p.pid, ws: careerWS_RS(p), player: p }));
  arr.sort((a, b) => (b.ws - a.ws) || (a.pid - b.pid)); // DESC WS, stable

  const N = arr.length;
  const rarityMap = new Map<number, number>();
  const rankMap = new Map<number, number>();
  const wsMap = new Map<number, number>();

  if (N === 0) return { rarityMap, rankMap, wsMap, eligibleCount: 0, ordered: [] };
  if (N === 1) {
    const only = arr[0];
    rarityMap.set(only.pid, 50);
    rankMap.set(only.pid, 1);
    wsMap.set(only.pid, only.ws);
    return { rarityMap, rankMap, wsMap, eligibleCount: 1, ordered: arr };
  }

  arr.forEach((row, idx) => {
    const rarity = Math.round(100 * (1 - idx / (N - 1))); // 100..0
    rarityMap.set(row.pid, rarity);
    rankMap.set(row.pid, idx + 1);
    wsMap.set(row.pid, row.ws);
  });

  return { rarityMap, rankMap, wsMap, eligibleCount: N, ordered: arr };
}

/** Chip color: 0 = red, 50 = amber, 100 = green */
export function rarityColor(score: number) {
  // Map 0..100 → hue 0..120 (red → green)
  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
  const hue = clamp((score / 100) * 120, 0, 120);
  return `hsl(${hue}deg 80% 45%)`;
}

export function rarityLabel(score: number): "Common"|"Uncommon"|"Notable"|"Rare"|"Ultra-rare" {
  if (score >= 80) return "Ultra-rare";
  if (score >= 60) return "Rare";
  if (score >= 40) return "Notable";
  if (score >= 20) return "Uncommon";
  return "Common";
}