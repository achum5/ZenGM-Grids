export type LeagueForInput = {
  players?: any[];
  teams?: any[];
  [k: string]: any;
};

// Try to reconstruct teams if league.teams is missing/short.
// We only need tid/abbrev/name for the generator to have enough context.
function uniqueTeamsFromPlayers(players: any[] = []) {
  const map = new Map<number, { tid: number; abbrev: string; name: string }>();

  for (const p of players) {
    const tidRaw =
      p?.tid ??
      p?.teamId ??
      p?.t?.id ??
      (Array.isArray(p?.stats) ? p.stats[p.stats.length - 1]?.tid : undefined);
    const tid = Number.isInteger(tidRaw) ? Number(tidRaw) : -1;
    if (tid < 0 || map.has(tid)) continue;

    const abbrev =
      p?.teamAbbrev ??
      (Array.isArray(p?.stats) ? p.stats[p.stats.length - 1]?.abbrev : undefined) ??
      `T${tid}`;
    const name =
      p?.teamName ??
      (Array.isArray(p?.stats) ? p.stats[p.stats.length - 1]?.teamName : undefined) ??
      `Team ${tid}`;

    map.set(tid, { tid, abbrev, name });
  }

  return Array.from(map.values());
}

// This must mirror what your server route used to do, but read from the league in memory
export function buildGenerateInput(league: LeagueForInput, opts: any = {}) {
  const players = Array.isArray(league?.players) ? league.players : [];

  let teams: any[] = Array.isArray(league?.teams) ? league.teams! : [];
  if (teams.length < 3) {
    // derive from players if needed
    teams = uniqueTeamsFromPlayers(players);
  }

  // Add any small props your generator needs (season/mode/criteria/etc).
  // Keep defaults so nothing is undefined.
  const input = {
    players: players.map((player: any) => ({
      ...player,
      teams: player.teams || [],
      achievements: player.achievements || [],
      years: player.years || []
    })),
    teams,
    mode: opts.mode ?? "classic",
    criteria: opts.criteria ?? [],
    season: opts.season ?? league?.meta?.season ?? 0,
  };

  return input;
}