// src/utils/rarityWS.ts
export type LeaguePlayer = any; // your player shape from league JSON

/** Career Win Shares (RS only): sum( (ows ?? 0) + (dws ?? 0) OR (ws ?? 0) ) */
export function careerWS_RS(player: LeaguePlayer): number {
  const rows = (player.stats ?? []).filter((s: any) => s && !s.playoffs);
  let ws = 0;
  for (const s of rows) {
    const ows = Number(s.ows ?? 0);
    const dws = Number(s.dws ?? 0);
    const wsRow = (ows + dws) || Number(s.ws ?? 0); // fallback if ws provided
    ws += wsRow;
  }
  return Number.isFinite(ws) ? ws : 0;
}

/** Build rarity maps from the **eligible set only** (not the whole league) */
export function computeCellRarityByWS(eligiblePlayers: LeaguePlayer[]) {
  const arr = eligiblePlayers.map(p => ({ pid: p.pid, player: p, ws: careerWS_RS(p) }));
  // DESC by WS; stable by pid
  arr.sort((a, b) => (b.ws - a.ws) || (a.pid - b.pid));

  const N = arr.length;
  const rarityMap = new Map<number, number>();
  const rankMap   = new Map<number, number>();
  const wsMap     = new Map<number, number>();

  if (N === 0) return { rarityMap, rankMap, wsMap, eligibleCount: 0, ordered: [] };
  if (N === 1) {
    rarityMap.set(arr[0].pid, 50); rankMap.set(arr[0].pid, 1); wsMap.set(arr[0].pid, arr[0].ws);
    return { rarityMap, rankMap, wsMap, eligibleCount: 1, ordered: arr };
  }

  arr.forEach((row, idx) => {
    // 100 = most rare (lowest WS), 0 = most common (highest WS)
    const rarity = Math.round(100 * (1 - idx / (N - 1)));
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