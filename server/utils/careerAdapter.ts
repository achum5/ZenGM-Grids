// utils/careerAdapter.ts
import type { PlayerCareer } from "./rarity";
import { reduceAwards } from "./rarity";

export function toPlayerCareerRS(player: any): PlayerCareer {
  const rs = (player.stats ?? []).filter((s: any) => s && (s.playoffs === false || s.playoffs === 0 || s.playoffs == null));

  const seasons = new Set(rs.map((s: any) => s.season)).size;
  const sum = (k: string) => rs.reduce((t: number, s: any) => t + (Number(s?.[k]) || 0), 0);
  const avg = (k: string, fallback = 0) => {
    const vals = rs.map((s: any) => Number(s?.[k])).filter((v: number) => Number.isFinite(v));
    return vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : fallback;
  };

  // Debug logging to confirm RS stats are found
  if (rs.length > 0) {
    console.log(`DEBUG: Player ${player.name || player.pid} has ${rs.length} RS seasons, GP: ${sum("gp")}, VORP: ${sum("vorp")}`);
  }

  return {
    pid: player.pid,
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
    awards: reduceAwards(player.awards ?? []),
  };
}