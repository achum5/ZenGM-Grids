// server/eligibility.ts
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
  playedForTeam: (p: LeaguePlayer, teamName: string) => p.teams.includes(teamName),

  // Career totals
  careerAssistsAtLeast: (p: LeaguePlayer, n: number) => rsCareerTotals(p).ast >= n,
  careerBlocksAtLeast:  (p: LeaguePlayer, n: number) => rsCareerTotals(p).blk >= n,

  // Season per-game (not tied to team)
  seasonBPGAtLeast:     (p: LeaguePlayer, bpg: number) => hasSeasonBPG(p, bpg),

  // Franchise lifer
  onlyOneTeam:          (p: LeaguePlayer) => rsTeamIds(p).length === 1,
};

/** Map achievement string to eligibility predicate */
export function getAchievementPredicate(achievement: string) {
  switch (achievement) {
    case "1,500+ Career Blocks":
      return (p: LeaguePlayer) => criteria.careerBlocksAtLeast(p, 1500);
    case "5,000+ Career Assists":
      return (p: LeaguePlayer) => criteria.careerAssistsAtLeast(p, 5000);
    case "Averaged 3+ BPG in a Season":
      return (p: LeaguePlayer) => criteria.seasonBPGAtLeast(p, 3.0);
    case "Averaged 15+ RPG in a Season":
      return (p: LeaguePlayer) => {
        for (const s of regularSeasonRows(p)) {
          const gp = Number(s.gp ?? 0);
          const reb = Number(s.reb ?? 0);
          if (gp > 0 && reb / gp >= 15.0) return true;
        }
        return false;
      };
    case "First Round Pick":
      return (p: LeaguePlayer) => p.achievements.includes("First Round Pick");
    case "2nd Round Pick":
      return (p: LeaguePlayer) => p.achievements.includes("2nd Round Pick");
    // Add more achievement mappings here as needed
    default:
      // Fallback to existing achievement array check for unhandled achievements
      return (p: LeaguePlayer) => p.achievements.includes(achievement);
  }
}

/** Proper eligibility check for a cell */
export function eligibleForCell(players: LeaguePlayer[], rowCriteria: any, colCriteria: any) {
  return players.filter(p => {
    // Row constraint
    if (rowCriteria.type === "team" && !criteria.playedForTeam(p, rowCriteria.value)) return false;
    if (rowCriteria.type === "achievement" && !getAchievementPredicate(rowCriteria.value)(p)) return false;

    // Column constraint  
    if (colCriteria.type === "team" && !criteria.playedForTeam(p, colCriteria.value)) return false;
    if (colCriteria.type === "achievement" && !getAchievementPredicate(colCriteria.value)(p)) return false;

    return true;
  });
}