// src/utils/rarity.ts
export type PlayerAwards = {
  champ?: number; allStar?: number; allStarMvp?: number; mvp?: number;
  roy?: number; smoy?: number; dpoy?: number; mip?: number;
  finalsMvp?: number; sfmvp?: number;
  allLeague1?: number; allLeague2?: number; allLeague3?: number;
  allDefensive1?: number; allDefensive2?: number; allDefensive3?: number;
  allRookie?: number;
};

export type PlayerCareer = {
  pid: number;
  numSeasons: number;
  gp: number;
  min: number;
  vorp: number;
  ows: number;
  dws: number;
  per?: number;
  obpm?: number;
  dbpm?: number;
  pm100?: number;
  onOff100?: number;
  awards: PlayerAwards;
};

const W_ACC = {
  mvp: 40, finalsMvp: 25, allLeague1: 12, allLeague2: 8, allLeague3: 6,
  allDefensive1: 6, allDefensive2: 4, allDefensive3: 3,
  allStar: 6, allStarMvp: 5, dpoy: 15, roy: 8, smoy: 8, mip: 6,
  sfmvp: 8, allRookie: 2, champ: 6,
} as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const minutesFactor = (mins: number) => clamp01(Math.log1p(mins) / Math.log1p(30000));
const reliability = (gp: number, seasons: number) => clamp01(0.6*(gp/246) + 0.4*(seasons/5));
const careerValue = (vorp: number, ows: number, dws: number) => 0.6*Math.max(0, vorp) + 0.4*(ows + dws);

function accoladesScore(a: PlayerAwards): number {
  let s = 0;
  (Object.keys(W_ACC) as (keyof typeof W_ACC)[]).forEach(k => { s += (a[k] ?? 0) * W_ACC[k]; });
  return s;
}
function rateTalent(per?: number, obpm?: number, dbpm?: number, pm100?: number, onOff100?: number) {
  const perTerm = per != null ? Math.max(0, per - 15) : 0;
  const bpmTerm = (obpm ?? 0) + (dbpm ?? 0);
  const onoff = ((pm100 ?? 0) + (onOff100 ?? 0)) / 2;
  return 0.5*perTerm + 0.4*bpmTerm + 0.1*onoff;
}

export function prominence(p: PlayerCareer): number {
  const A = accoladesScore(p.awards);
  const CV = careerValue(p.vorp, p.ows, p.dws) * minutesFactor(p.min);
  const R  = reliability(p.gp, p.numSeasons);
  const RT = rateTalent(p.per, p.obpm, p.dbpm, p.pm100, p.onOff100) * R;
  const L  = 0.5 * Math.log1p(p.gp) + 0.5 * p.numSeasons;
  return 0.45*A + 0.25*CV + 0.20*RT + 0.10*L;
}

/** Normalize within a cell's eligible set. 0=most common, 100=rarest. */
export function rarityScoresForEligible(players: PlayerCareer[]) {
  const arr = players.map(p => ({ pid: p.pid, prom: prominence(p) }));
  const min = Math.min(...arr.map(a => a.prom));
  const max = Math.max(...arr.map(a => a.prom));
  const rng = Math.max(1e-6, max - min);
  return arr.map(a => ({
    pid: a.pid,
    prom: a.prom,
    rarity: Math.round(100 * (1 - (a.prom - min) / rng))
  }));
}

/** Nice color for rarity chip (dark theme). Higher rarity → warmer/purple. */
export function rarityColor(rarity: number) {
  // 0..100 mapped to HSL: 0=teal, 50=amber, 100=violet
  const h = 180 - (rarity * 1.8); // start teal-ish → go to purple-ish via CSS hue-rotate
  // Clamp a bit nicer for dark backgrounds
  return `hsl(${Math.max(0, Math.min(300, h))}deg 80% 45%)`;
}