export type LeaguePlayer = any;

function isRS(s: any) {
  // treat undefined/false/0 as regular season
  return s && !s.playoffs;
}

/** Career Win Shares (regular season only). Uses `ws` if present, else `ows+dws`. */
export function careerWS(player: LeaguePlayer): number {
  const rows = (player?.stats ?? []).filter(isRS);
  let total = 0;
  for (const s of rows) {
    if (Number.isFinite(Number(s?.ws))) {
      total += Number(s.ws);
    } else {
      total += (Number(s?.ows) || 0) + (Number(s?.dws) || 0);
    }
  }
  return Number.isFinite(total) ? total : 0;
}

/**
 * Compute rarity for a cell:
 *  - Input: array of *eligible full player objects*
 *  - Sort DESC by WS (highest first = most common)
 *  - Rarity = reverse percentile index, 0..100 where 100 = most rare
 *  - Returns: ordered list + maps + eligibleCount
 */
export function computeCellRarityByWS(eligiblePlayers: LeaguePlayer[]) {
  const arr = eligiblePlayers.map(p => ({
    pid: p.pid,
    ws: careerWS(p),
    player: p,
  }));

  // Stable sort: DESC by WS, then pid ASC
  arr.sort((a, b) => (b.ws - a.ws) || (a.pid - b.pid));

  const N = arr.length;
  const rarityMap = new Map<number, number>();
  const rankMap   = new Map<number, number>();
  const wsMap     = new Map<number, number>();

  if (N === 0) return { ordered: [], rarityMap, rankMap, wsMap, eligibleCount: 0 };
  if (N === 1) {
    const only = arr[0];
    rarityMap.set(only.pid, 50); // neutral when only one option
    rankMap.set(only.pid, 1);
    wsMap.set(only.pid, only.ws);
    return { ordered: arr, rarityMap, rankMap, wsMap, eligibleCount: 1 };
  }

  arr.forEach((row, idx) => {
    // reverse percentile: idx=0 → 0 (common), idx=N-1 → 100 (rare)
    const rarity = Math.round(100 * (idx / (N - 1)));
    rarityMap.set(row.pid, rarity);
    rankMap.set(row.pid, idx + 1);
    wsMap.set(row.pid, row.ws);
  });

  return { ordered: arr, rarityMap, rankMap, wsMap, eligibleCount: N };
}

/** Color for rarity chip: 0=red → 100=green */
export function rarityColor(score: number) {
  const hue = Math.max(0, Math.min(120, (score / 100) * 120));
  return `hsl(${hue}deg 80% 45%)`;
}

export function rarityLabel(score: number): "Common"|"Uncommon"|"Notable"|"Rare"|"Ultra-rare" {
  if (score >= 80) return "Ultra-rare";
  if (score >= 60) return "Rare";
  if (score >= 40) return "Notable";
  if (score >= 20) return "Uncommon";
  return "Common";
}