// shared/utils/careerStats.ts

export type PlayerSeasonStats = {
  playoffs: boolean;
  season: number;
  gp: number;
  min: number;
  fg: number; fga: number;
  tp: number; tpa: number;
  ft: number; fta: number;
  orb: number; drb: number;
  ast: number; tov: number;
  stl: number; blk: number;
  pts: number;
};

export type Player = {
  pid: number;
  firstName: string;
  lastName: string;
  stats?: Partial<PlayerSeasonStats>[];
};

export type Totals = {
  gp: number; min: number;
  fg: number; fga: number;
  tp: number; tpa: number;
  ft: number; fta: number;
  orb: number; drb: number;
  ast: number; tov: number;
  stl: number; blk: number;
  pts: number;
};

const ZERO: Totals = {
  gp: 0, min: 0,
  fg: 0, fga: 0,
  tp: 0, tpa: 0,
  ft: 0, fta: 0,
  orb: 0, drb: 0,
  ast: 0, tov: 0,
  stl: 0, blk: 0,
  pts: 0,
};

/** Career totals from regular season ONLY (playoffs excluded). */
export function getCareerTotalsRS(player: Player): Totals {
  const out: Totals = { ...ZERO };
  const seasons = (player.stats ?? []).filter(s => s && s.playoffs === false);

  for (const s of seasons) {
    out.gp += s.gp ?? 0;
    out.min += s.min ?? 0;

    out.fg  += s.fg  ?? 0; out.fga += s.fga ?? 0;
    out.tp  += s.tp  ?? 0; out.tpa += s.tpa ?? 0;
    out.ft  += s.ft  ?? 0; out.fta += s.fta ?? 0;

    out.orb += s.orb ?? 0; out.drb += s.drb ?? 0;
    out.ast += s.ast ?? 0; out.tov += s.tov ?? 0;
    out.stl += s.stl ?? 0; out.blk += s.blk ?? 0;
    out.pts += s.pts ?? 0;
  }
  return out;
}

export type Averages = {
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; mpg: number;
  fgp: number; tpp: number; ftp: number; // 0–100 (percent)
};

/** Per-game averages + career shooting percentages (regular season only). */
export function getCareerAveragesRS(t: Totals): Averages {
  const gp = t.gp || 1;
  const reb = t.orb + t.drb;

  return {
    ppg: r1(t.pts / gp),
    rpg: r1(reb / gp),
    apg: r1(t.ast / gp),
    spg: r1(t.stl / gp),
    bpg: r1(t.blk / gp),
    mpg: r1(t.min / gp),
    fgp: pct(t.fg, t.fga),
    tpp: pct(t.tp, t.tpa),
    ftp: pct(t.ft, t.fta),
  };
}

function pct(makes: number, att: number): number {
  if (!att) return 0;
  return Math.round((makes / att) * 1000) / 10; // one decimal place
}
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}