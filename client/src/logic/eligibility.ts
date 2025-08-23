// src/logic/eligibility.ts
export type LeaguePlayer = any;

/** Regular-season season rows (playoffs may be false/0/undefined) */
export function regularSeasonRows(p: LeaguePlayer) {
  return (p.stats ?? []).filter((s: any) => s && !s.playoffs);
}

/** Distinct team IDs a player appeared for (RS only) */
export function rsTeamIds(p: LeaguePlayer): number[] {
  const set = new Set<number>();
  for (const s of regularSeasonRows(p)) {
    if (typeof s.tid === "number") set.add(s.tid);
  }
  return Array.from(set);
}

/** Career totals (RS only) */
export function rsCareerTotals(p: LeaguePlayer) {
  const rows = regularSeasonRows(p);
  let gp=0, blk=0, ast=0;
  for (const s of rows) {
    gp  += Number(s.gp  ?? 0);
    blk += Number(s.blk ?? 0);
    ast += Number(s.ast ?? 0);
  }
  return { gp, blk, ast };
}

/** Per-season checks (RS only) */
export function hasSeasonBPG(p: LeaguePlayer, minBPG: number): boolean {
  for (const s of regularSeasonRows(p)) {
    const gp  = Number(s.gp  ?? 0);
    const blk = Number(s.blk ?? 0);
    if (gp > 0 && blk / gp >= minBPG) return true;
  }
  return false;
}

/** Criteria predicates (rows x columns) */
export const criteria = {
  // Team only
  playedForTeam: (p: LeaguePlayer, tid: number) => rsTeamIds(p).includes(tid),

  // Career totals
  careerAssistsAtLeast: (p: LeaguePlayer, n: number) => rsCareerTotals(p).ast >= n,
  careerBlocksAtLeast:  (p: LeaguePlayer, n: number) => rsCareerTotals(p).blk >= n,

  // Season per-game (not tied to team)
  seasonBPGAtLeast:     (p: LeaguePlayer, bpg: number) => hasSeasonBPG(p, bpg),

  // Franchise lifer
  onlyOneTeam:          (p: LeaguePlayer) => rsTeamIds(p).length === 1,
};