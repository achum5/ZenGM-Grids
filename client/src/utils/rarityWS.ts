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
 * Build rarity maps for a cell using WS.
 * Sort DESC by WS (highest first = most common).
 * rarityScore = round(100 * idx / (N - 1))  // 0 best/common, 100 rarest/deep cut
 * rank = 1-based position in DESC list (1 = most common)
 */
export function computeCellRarityByWS(eligiblePlayers: LeaguePlayer[]) {
  const arr = eligiblePlayers.map(p => ({ pid: p.pid, ws: careerWS_RS(p) }));
  // stable sort: by ws desc, then pid asc
  arr.sort((a, b) => (b.ws - a.ws) || (a.pid - b.pid));

  const N = arr.length;
  const rarityMap = new Map<number, number>();
  const rankMap = new Map<number, number>();
  const wsMap = new Map<number, number>();

  if (N === 0) return { rarityMap, rankMap, wsMap, eligibleCount: 0, ordered: [] };
  if (N === 1) {
    const only = arr[0];
    rarityMap.set(only.pid, 50); // neutral when only one option
    rankMap.set(only.pid, 1);
    wsMap.set(only.pid, only.ws);
    return { rarityMap, rankMap, wsMap, eligibleCount: 1, ordered: arr };
  }

  arr.forEach((row, idx) => {
    const rarity = Math.round(100 * (idx / (N - 1))); // 0..100 (lower = more "common")
    rarityMap.set(row.pid, rarity);
    rankMap.set(row.pid, idx + 1); // 1..N
    wsMap.set(row.pid, row.ws);
  });

  return { rarityMap, rankMap, wsMap, eligibleCount: N, ordered: arr };
}

/** Chip color based on score: lower (better/common) = green, higher (rarer) = violet/red */
export function rarityColor(score: number) {
  // 0 → green, 50 → amber, 100 → magenta
  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
  const hue = clamp(120 - score * 1.2, -40, 300); // 120≈green → down to magenta-ish
  return `hsl(${hue}deg 80% 45%)`;
}

export function rarityBucket(score: number): "Common"|"Uncommon"|"Notable"|"Rare"|"Ultra-rare" {
  if (score >= 80) return "Ultra-rare";
  if (score >= 60) return "Rare";
  if (score >= 40) return "Notable";
  if (score >= 20) return "Uncommon";
  return "Common";
}