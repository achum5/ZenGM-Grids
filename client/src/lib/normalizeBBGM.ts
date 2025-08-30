import type { LeagueData, BBGMPlayer, Team, SeasonLine, Award } from "@shared/schema";

const toName = (p: any) =>
  [p.firstName, p.lastName].filter(Boolean).join(" ") || p.name || `Player ${p.pid}`;

const notPlayoffs = (s: any) => !s?.playoffs; // BBGM marks playoffs boolean per stats row

export function normalizeBBGM(rawIn: any): LeagueData {
  const raw = rawIn?.players ? rawIn : (rawIn?.league ?? rawIn);

  // Teams
  const teams: Team[] = (raw.teams ?? []).map((t: any) => ({
    tid: t.tid,
    abbrev: t.abbrev,
    name: `${t.region ?? t.name ?? ""} ${t.name ?? ""}`.trim(),
  }));

  // Seasons range
  const seasonsAll = new Set<number>();
  const players: BBGMPlayer[] = (raw.players ?? []).map((p: any) => {
    const seasons: SeasonLine[] = [];
    let gp=0, pts=0, ast=0, stl=0, blk=0, tp=0, trb=0, fga=0, fta=0, tpa=0;

    for (const s of (p.stats ?? [])) {
      if (!notPlayoffs(s)) continue;
      const line: SeasonLine = {
        season: s.season,
        tid: s.tid,
        gp: s.gp ?? 0,
        pts: s.pts ?? 0,
        ast: s.ast ?? 0,
        stl: s.stl ?? 0,
        blk: s.blk ?? 0,
        tp:  s.tp  ?? 0,
        fga: s.fga ?? 0,
        fta: s.fta ?? 0,
        tpa: s.tpa ?? 0,
        fgp: s.fgp ?? (s.fga ? (s.fg ?? 0) / s.fga : undefined),
        ftp: s.ftp ?? (s.fta ? (s.ft ?? 0) / s.fta : undefined),
        tpp: s.tpp ?? (s.tpa ? (s.tp ?? 0) / s.tpa : undefined),
        r_orb: s.orb ?? 0,
        r_drb: s.drb ?? 0,
        mp: s.min ?? s.mp ?? undefined,
      };
      seasons.push(line);
      seasonsAll.add(line.season);

      gp += line.gp;
      pts += line.pts; ast += line.ast; stl += line.stl; blk += line.blk; tp += line.tp;
      trb += line.r_orb + line.r_drb;
      fga += line.fga; fta += line.fta; tpa += line.tpa;
    }

    const teamsPlayed = new Set<number>();
    for (const sl of seasons) teamsPlayed.add(sl.tid);
    for (const tid of (p.statsTids ?? [])) teamsPlayed.add(tid);

    const awards: Award[] = (p.awards ?? []).map((a: any) => ({
      season: a.season, type: String(a.type ?? ""),
    }));

    const player: BBGMPlayer = {
      pid: p.pid,
      name: toName(p),
      bornYear: p.born?.year ?? p.bornYear,
      awards,
      seasons,
      teamsPlayed,
      career: { gp, pts, ast, stl, blk, tp, trb, fga, fta, tpa },
      draft: {
        year: p.draft?.year,
        round: p.draft?.roundNumber ?? p.draft?.round,
        pick: p.draft?.pick,
      },
      hof: p.hof ?? p.retiredHallOfFame ?? false,
      gameHighs: p.gameHighs ? {
        pts: p.gameHighs.pts,
        trb: p.gameHighs.trb,
        ast: p.gameHighs.ast,
        tp: p.gameHighs.tp,
      } : undefined,
    };

    return player;
  });

  const allSeasons = Array.from(seasonsAll.values());
  const minSeason = allSeasons.length ? Math.min(...allSeasons) : undefined;
  const maxSeason = allSeasons.length ? Math.max(...allSeasons) : undefined;

  return { players, teams, minSeason, maxSeason };
}