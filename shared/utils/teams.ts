export function getCareerTeamIds(p: any): Set<number> {
  const s = new Set<number>();

  if (Array.isArray(p.teams)) {
    for (const t of p.teams) if (typeof t?.tid === "number") s.add(t.tid);
  }
  if (Array.isArray(p.stats)) {
    for (const r of p.stats) if (r && typeof r.tid === "number" && r.tid >= 0) s.add(r.tid);
  }
  return s;
}