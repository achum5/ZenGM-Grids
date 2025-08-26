// server/evals.ts
import type { Indices, LeaderKey } from "./indices";

const ledLeague = (pid:number, key:LeaderKey, leadersBySeason:Indices["leadersBySeason"]) => {
  for (const [season, sets] of Array.from(leadersBySeason.entries())) if (sets[key]?.has(pid)) return true;
  return false;
};

const didPlayForTeam = (p:any, tid:number)=> (p.stats ?? []).some((s:any)=> (s.gp??0)>0 && s.tid===tid);

export const EVALS: Record<string,(p:any, ix:Indices, ctx?:{teamId?:number})=>boolean> = {
  // — Career totals (already working) —
  "20,000+ Career Points": (p,ix)=> (ix.careerTotals.get(p.pid)?.pts ?? 0) >= 20000,
  "10,000+ Career Rebounds": (p,ix)=> (ix.careerTotals.get(p.pid)?.trb ?? 0) >= 10000,
  "5,000+ Career Assists": (p,ix)=> (ix.careerTotals.get(p.pid)?.ast ?? 0) >= 5000,
  "2,000+ Career Steals": (p,ix)=> (ix.careerTotals.get(p.pid)?.stl ?? 0) >= 2000,
  "1,500+ Career Blocks": (p,ix)=> (ix.careerTotals.get(p.pid)?.blk ?? 0) >= 1500,
  "2,000+ Made Threes": (p,ix)=> (ix.careerTotals.get(p.pid)?.tp  ?? 0) >= 2000,

  // — Season averages —
  "Averaged 30+ PPG in a Season": (p,ix)=> (p.stats ?? []).some((s:any)=> !s.playoffs && (s.gp??0)>=Math.ceil((ix.numGamesBySeason.get(s.season)??82)*0.58) && (s.pts??0)/(s.gp||1) >= 30 - 1e-9),
  "Averaged 10+ APG in a Season": (p,ix)=> (p.stats ?? []).some((s:any)=> !s.playoffs && (s.gp??0)>=Math.ceil((ix.numGamesBySeason.get(s.season)??82)*0.58) && (s.ast??0)/(s.gp||1) >= 10 - 1e-9),
  "Averaged 15+ RPG in a Season": (p,ix)=> (p.stats ?? []).some((s:any)=> !s.playoffs && (s.gp??0)>=Math.ceil((ix.numGamesBySeason.get(s.season)??82)*0.58) && ((s.orb??0)+(s.drb??0))/(s.gp||1) >= 15 - 1e-9),
  "Averaged 3+ BPG in a Season":  (p,ix)=> (p.stats ?? []).some((s:any)=> !s.playoffs && (s.gp??0)>=Math.ceil((ix.numGamesBySeason.get(s.season)??82)*0.58) && (s.blk??0)/(s.gp||1) >= 3 - 1e-9),
  "Averaged 2.5+ SPG in a Season":(p,ix)=> (p.stats ?? []).some((s:any)=> !s.playoffs && (s.gp??0)>=Math.ceil((ix.numGamesBySeason.get(s.season)??82)*0.58) && (s.stl??0)/(s.gp||1) >= 2.5 - 1e-9),
  "Shot 50/40/90 in a Season":   (p,ix)=> (p.stats ?? []).some((s:any)=> !s.playoffs && (s.fga??0)>=300 && (s.tpa??0)>=82 && (s.fta??0)>=125 && (s.fg/(s.fga||1))>=0.5-1e-9 && (s.tp/(s.tpa||1))>=0.4-1e-9 && (s.ft/(s.fta||1))>=0.9-1e-9),

  // — Leaders (5 missing) —
  "Led League in Scoring":  (p,ix)=> ledLeague(p.pid, "ppg", ix.leadersBySeason),
  "Led League in Rebounds": (p,ix)=> ledLeague(p.pid, "rpg", ix.leadersBySeason),
  "Led League in Assists":  (p,ix)=> ledLeague(p.pid, "apg", ix.leadersBySeason),
  "Led League in Steals":   (p,ix)=> ledLeague(p.pid, "spg", ix.leadersBySeason),
  "Led League in Blocks":   (p,ix)=> ledLeague(p.pid, "bpg", ix.leadersBySeason),

  // — Game feats (5 missing) —
  "Scored 50+ in a Game":       (p,ix)=> (ix.featsByPid.get(p.pid) ?? []).some(f=> (f.pts ?? 0) >= 50),
  "Triple-Double in a Game":    (p,ix)=> (ix.featsByPid.get(p.pid) ?? []).some(f=> (f.td ?? 0) > 0 || [f.pts??0, (f.orb??0)+(f.drb??0), f.ast??0, f.stl??0, f.blk??0].filter(v=>v>=10).length >= 3),
  "20+ Rebounds in a Game":     (p,ix)=> (ix.featsByPid.get(p.pid) ?? []).some(f=> (f.orb ?? 0) + (f.drb ?? 0) >= 20),
  "20+ Assists in a Game":      (p,ix)=> (ix.featsByPid.get(p.pid) ?? []).some(f=> (f.ast ?? 0) >= 20),
  "10+ Threes in a Game":       (p,ix)=> (ix.featsByPid.get(p.pid) ?? []).some(f=> (f.tp  ?? 0) >= 10),

  // — Awards (6 missing) —
  "MVP Winner":                 (p,ix)=> ix.awards.mvp.has(p.pid),
  "Defensive Player of the Year":(p,ix)=> ix.awards.dpoy.has(p.pid),
  "Rookie of the Year":         (p,ix)=> ix.awards.roy.has(p.pid),
  "Sixth Man of the Year":      (p,ix)=> ix.awards.smoy.has(p.pid),
  "Most Improved Player":       (p,ix)=> ix.awards.mip.has(p.pid),
  "Finals MVP":                 (p,ix)=> ix.awards.finalsMvp.has(p.pid),

  // — Team achievements (2 missing) —
  "All-League Team":            (p,ix)=> ix.awards.allLeague.has(p.pid),
  "All-Defensive Team":         (p,ix)=> ix.awards.allDefensive.has(p.pid),

  // — All-Star / Champions / ATGs (5 missing) —
  "All-Star Selection":         (p,ix)=> { for (const [season, set] of Array.from(ix.allStarsBySeason.entries())) if (set.has(p.pid)) return true; return false; },
  "Made All-Star Team at Age 35+": (p,ix)=> {
    const born = p.born?.year ?? 0;
    for (const [season,set] of Array.from(ix.allStarsBySeason.entries())) if (set.has(p.pid) && season - born >= 35) return true;
    return false;
  },
  "NBA Champion":               (p,ix)=> (p.stats ?? []).some((s:any)=> (s.gp??0)>0 && ix.championsBySeason.get(s.season) === s.tid),
  "Champion":                   (p,ix)=> (p.stats ?? []).some((s:any)=> (s.gp??0)>0 && ix.championsBySeason.get(s.season) === s.tid),
  "Teammate of All-Time Greats": (p,ix)=> (p.stats ?? []).some((s:any)=> (s.gp??0)>0 && (()=>{ const key=`${s.season}:${s.tid}`; const set=ix.hofSeasonTidMap.get(key); return set && (set.size>1 || !set.has(p.pid)); })()),
  
  // — Career meta & draft (already working elsewhere, keep here for consistency) —
  "Played 15+ Seasons":         (p)=> new Set((p.stats??[]).filter((s:any)=>!s.playoffs && (s.gp??0)>0).map((s:any)=>s.season)).size >= 15,
  "#1 Overall Draft Pick":      (p)=> p.draft?.round===1 && p.draft?.pick===1,
  "Undrafted Player":           (p)=> (p.draft?.round??0)<=0 || (p.draft?.pick??0)<=0 || (p.draft?.tid??-1)<0,
  "First Round Pick":           (p)=> p.draft?.round===1,
  "2nd Round Pick":             (p)=> p.draft?.round===2,
  "Only One Team":              (p)=> { const tids=new Set<number>(); for (const s of p.stats??[]) if ((s.gp??0)>0) tids.add(s.tid); return tids.size===1; },
  "Hall of Fame":               (p,ix)=> ix.hallOfFamers.has(p.pid),
};

// Population counts for grid generation
export function populationByCriterion(players:any[], ix:Indices, id:string, teamId?:number) {
  if (id.endsWith(" (team)")) {
    const team = id.slice(0, -7);
    return players.filter(p => p.teams?.includes(team)).length;
  }
  
  if (id.endsWith(" (achievement)")) {
    const achievement = id.slice(0, -13);
    const evaluator = EVALS[achievement];
    if (!evaluator) return 0;
    return players.filter(p => evaluator(p, ix, {teamId})).length;
  }
  
  return 0;
}

// Check if player meets criteria
export function meetsCriteria(player:any, ix:Indices, criterion:any): boolean {
  if (criterion.type === 'team') {
    return player.teams?.includes(criterion.value) ?? false;
  }
  
  if (criterion.type === 'achievement') {
    const evaluator = EVALS[criterion.value];
    if (!evaluator) return false;
    return evaluator(player, ix);
  }
  
  return false;
}