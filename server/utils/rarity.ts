// server/utils/rarity.ts - Backend copy of rarity utilities
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

export function toPlayerCareerRS(player: any): PlayerCareer {
  const rs = (player.stats ?? []).filter((s: any) => s && s.playoffs === false);
  const seasons = new Set(rs.map((s: any) => s.season)).size;
  const sum = (k: string) => rs.reduce((t: number, s: any) => t + (s?.[k] ?? 0), 0);
  const avg = (k: string, fallback = 0) => {
    const vals = rs.map((s: any) => s?.[k]).filter((v: any) => v != null);
    return vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : fallback;
  };

  const awards: PlayerAwards = {};
  for (const a of (player.awards ?? [])) {
    const type = a.type;
    (awards as any)[type] = ((awards as any)[type] ?? 0) + 1;
  }

  return {
    pid: player.pid || Math.random(),
    numSeasons: seasons,
    gp: sum("gp"),
    min: sum("min"),
    vorp: sum("vorp"),
    ows: sum("ows"),
    dws: sum("dws"),
    per: avg("per", 15),
    obpm: avg("obpm", 0),
    dbpm: avg("dbpm", 0),
    pm100: avg("pm100", 0),
    onOff100: avg("onOff100", 0),
    awards,
  };
}

export function rarityScoresForEligible(players: PlayerCareer[]) {
  if (players.length < 2) {
    return players.map(p => ({ pid: p.pid, prom: 0, rarity: 50 }));
  }

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

export function computeCellRarity(eligiblePlayers: any[]) {
  if (eligiblePlayers.length < 2) {
    const map = new Map<string, number>();
    eligiblePlayers.forEach(player => {
      map.set(player.name, 50);
    });
    return map;
  }

  const careers = eligiblePlayers.map(toPlayerCareerRS);
  const scores = rarityScoresForEligible(careers);
  
  const map = new Map<string, number>();
  scores.forEach((s, index) => {
    const player = eligiblePlayers[index];
    if (player && player.name) {
      map.set(player.name, s.rarity);
    }
  });
  
  return map;
}