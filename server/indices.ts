// server/indices.ts
export type LeaderKey = "ppg" | "rpg" | "apg" | "spg" | "bpg";
export type Indices = {
  numGamesBySeason: Map<number, number>;
  careerTotals: Map<number, { pts:number, trb:number, ast:number, stl:number, blk:number, tp:number }>;
  leadersBySeason: Map<number, Record<LeaderKey, Set<number>>>;
  awards: {
    mvp:Set<number>, dpoy:Set<number>, roy:Set<number>, smoy:Set<number>, mip:Set<number>, finalsMvp:Set<number>,
    allLeague:Set<number>, allDefensive:Set<number>
  };
  allStarsBySeason: Map<number, Set<number>>;
  championsBySeason: Map<number, number>;
  hallOfFamers: Set<number>;
  hofSeasonTidMap: Map<string, Set<number>>;   // `${season}:${tid}` → set of HOF pids
  featsByPid: Map<number, any[]>;              // normalized game feats
};

const EPS = 1e-9;
const seasonMinGames = (n:Map<number,number>, season:number) => Math.ceil((n.get(season) ?? 82) * 0.58);

export function buildIndices(league:any): Indices {
  // 1) season length
  const numGamesBySeason = new Map<number,number>();
  for (const row of league.gameAttributes?.numGames ?? []) {
    if (typeof row?.season === "number") numGamesBySeason.set(row.season, row.numGames ?? row.value ?? 82);
  }

  // 2) career totals (REGULAR SEASON only); REB = ORB+DRB
  const careerTotals = new Map<number, any>();
  for (const p of league.players ?? []) {
    let pts=0, ast=0, stl=0, blk=0, tp=0, orb=0, drb=0;
    for (const s of p.stats ?? []) {
      if (s.playoffs) continue;
      pts+=s.pts??0; ast+=s.ast??0; stl+=s.stl??0; blk+=s.blk??0; tp+=s.tp??0;
      orb+=s.orb??0; drb+=s.drb??0;
    }
    careerTotals.set(p.pid, { pts, ast, stl, blk, tp, trb: orb+drb });
  }

  // 3) leaders by season (per-game, min games, ties ok)
  const bySeason = new Map<number, Array<{pid:number, s:any}>>();
  for (const p of league.players ?? []) {
    if (typeof p.pid !== "number") continue;
    for (const s of p.stats ?? []) {
      if (s.playoffs) continue;
      const arr = bySeason.get(s.season) ?? [];
      arr.push({ pid:p.pid, s });
      bySeason.set(s.season, arr);
    }
  }
  const leadersBySeason = new Map<number, any>();
  for (const [season, arr] of bySeason) {
    const MIN = seasonMinGames(numGamesBySeason, season);
    let max = { ppg:-Infinity, rpg:-Infinity, apg:-Infinity, spg:-Infinity, bpg:-Infinity };
    const rows = arr.map(({pid, s})=>{
      const gp=s.gp??0, ok=gp>=MIN;
      const ppg=(s.pts??0)/(gp||1);
      const rpg=((s.orb??0)+(s.drb??0))/(gp||1);
      const apg=(s.ast??0)/(gp||1);
      const spg=(s.stl??0)/(gp||1);
      const bpg=(s.blk??0)/(gp||1);
      if (ok){ max.ppg=Math.max(max.ppg,ppg); max.rpg=Math.max(max.rpg,rpg); max.apg=Math.max(max.apg,apg); max.spg=Math.max(max.spg,spg); max.bpg=Math.max(max.bpg,bpg); }
      return {pid, ok, ppg, rpg, apg, spg, bpg};
    });
    const set = (k:LeaderKey)=> new Set(rows.filter(r=>r.ok && r[k] >= (max as any)[k]-EPS).map(r=>r.pid));
    leadersBySeason.set(season, { ppg:set("ppg"), rpg:set("rpg"), apg:set("apg"), spg:set("spg"), bpg:set("bpg") });
  }

  // 4) awards + teams of year
  const awards = { mvp:new Set<number>(), dpoy:new Set<number>(), roy:new Set<number>(), smoy:new Set<number>(), mip:new Set<number>(), finalsMvp:new Set<number>(), allLeague:new Set<number>(), allDefensive:new Set<number>() };
  for (const a of league.awards ?? []) {
    a.mvp?.pid && awards.mvp.add(a.mvp.pid);
    a.dpoy?.pid && awards.dpoy.add(a.dpoy.pid);
    a.roy?.pid && awards.roy.add(a.roy.pid);
    a.smoy?.pid && awards.smoy.add(a.smoy.pid);
    a.mip?.pid && awards.mip.add(a.mip.pid);
    a.finalsMvp?.pid && awards.finalsMvp.add(a.finalsMvp.pid);
    for (const t of a.allLeague ?? []) for (const pl of t.players ?? []) awards.allLeague.add(pl.pid);
    for (const t of a.allDefensive ?? []) for (const pl of t.players ?? []) awards.allDefensive.add(pl.pid);
  }

  // 5) all-stars
  const allStarsBySeason = new Map<number, Set<number>>();
  for (const AS of league.allStars ?? []) {
    const set = allStarsBySeason.get(AS.season) ?? new Set<number>();
    for (const tm of AS.teams ?? []) {
      const list = tm.roster ?? tm.players ?? [];
      for (const it of list) {
        const pid = typeof it === "number" ? it : (it?.pid ?? it?.p?.pid);
        if (typeof pid === "number") set.add(pid);
      }
    }
    allStarsBySeason.set(AS.season, set);
  }

  // 6) champions by season (finals)
  const championsBySeason = new Map<number, number>();
  for (const ps of league.playoffSeries ?? []) {
    const last = (ps.series ?? [])[ (ps.series?.length ?? 1) - 1 ] ?? [];
    let champTid:number|undefined;
    for (const ser of last) {
      const hw=ser?.home?.won ?? 0, aw=ser?.away?.won ?? 0;
      if (hw>=4 || aw>=4) { champTid = hw>aw ? ser.home.tid : ser.away.tid; break; }
    }
    if (!champTid && last[0]) {
      const s=last[0]; champTid=(s.home?.won??0)>(s.away?.won??0)?s.home.tid:s.away.tid;
    }
    if (typeof champTid === "number") championsBySeason.set(ps.season, champTid);
  }

  // 7) HOF sets + teammate-of-ATGs helper
  const hallOfFamers = new Set<number>();
  for (const e of league.events ?? []) if (e.type === "hallOfFame") for (const pid of e.pids ?? []) hallOfFamers.add(pid);
  const hofSeasonTidMap = new Map<string, Set<number>>();
  for (const p of league.players ?? []) {
    if (!hallOfFamers.has(p.pid)) continue;
    for (const s of p.stats ?? []) {
      if ((s.gp ?? 0) <= 0) continue;
      const key = `${s.season}:${s.tid}`;
      const set = hofSeasonTidMap.get(key) ?? new Set<number>();
      set.add(p.pid);
      hofSeasonTidMap.set(key, set);
    }
  }

  // 8) game feats per pid (normalize)
  const featsByPid = new Map<number, any[]>();
  for (const f of league.playerFeats ?? []) {
    const pid = f.pid ?? f.playerID ?? f.player?.pid;
    const s   = f.stats ?? f.s ?? f;
    if (typeof pid !== "number") continue;
    (featsByPid.get(pid) ?? featsByPid.set(pid, []).get(pid)!).push(s);
  }

  return { numGamesBySeason, careerTotals, leadersBySeason, awards, allStarsBySeason, championsBySeason, hallOfFamers, hofSeasonTidMap, featsByPid };
}