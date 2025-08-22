// src/utils/careerAdapter.ts
import type { PlayerCareer, PlayerAwards } from "./rarity";

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
    pid: player.pid || Math.random(), // fallback for missing pid
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