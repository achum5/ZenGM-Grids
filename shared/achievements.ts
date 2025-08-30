import type { LeagueData, BBGMPlayer } from "./schema";

// ---------- helpers ----------
const hasAward = (p: BBGMPlayer, substr: string) =>
  (p.awards ?? []).some(a => a.type.toLowerCase().includes(substr.toLowerCase()));

const careerRate = (num: number, den: number) => (den > 0 ? num / den : 0);

const seasonPPG = (s: BBGMPlayer["seasons"][number]) => careerRate(s.pts, s.gp);
const seasonAPG = (s: BBGMPlayer["seasons"][number]) => careerRate(s.ast, s.gp);
const seasonRPG = (s: BBGMPlayer["seasons"][number]) => careerRate(s.r_orb + s.r_drb, s.gp);
const seasonBPG = (s: BBGMPlayer["seasons"][number]) => careerRate(s.blk, s.gp);
const seasonSPG = (s: BBGMPlayer["seasons"][number]) => careerRate(s.stl, s.gp);
const pct = (made: number, att: number) => (att > 0 ? made / att : 0);

// Sample-size thresholds to avoid 3-game outliers
const MIN_SEASON_GP = 40;         // qualify season-based feats
const MIN_FGA = 300, MIN_3PA = 150, MIN_FTA = 125; // for 50/40/90

// Age by season: season is NBA year end; approximate age = season - bornYear
const ageInSeason = (p: BBGMPlayer, season: number) =>
  p.bornYear ? season - p.bornYear : undefined;

// ---------- category tests ----------
export const Achievements = {
  // Career Milestones
  "20,000+ Career Points": (p: BBGMPlayer) => p.career.pts >= 20000,
  "10,000+ Career Rebounds": (p: BBGMPlayer) => p.career.trb >= 10000,
  "5,000+ Career Assists": (p: BBGMPlayer) => p.career.ast >= 5000,
  "2,000+ Career Steals": (p: BBGMPlayer) => p.career.stl >= 2000,
  "1,500+ Career Blocks": (p: BBGMPlayer) => p.career.blk >= 1500,
  "2,000+ Made Threes": (p: BBGMPlayer) => p.career.tp >= 2000,

  // Single-season statistical achievements (qualified seasons only)
  "Averaged 30+ PPG in a Season": (p: BBGMPlayer) => p.seasons.some(s => s.gp >= MIN_SEASON_GP && seasonPPG(s) >= 30),
  "Averaged 10+ APG in a Season": (p: BBGMPlayer) => p.seasons.some(s => s.gp >= MIN_SEASON_GP && seasonAPG(s) >= 10),
  "Averaged 15+ RPG in a Season": (p: BBGMPlayer) => p.seasons.some(s => s.gp >= MIN_SEASON_GP && seasonRPG(s) >= 15),
  "Averaged 3+ BPG in a Season": (p: BBGMPlayer) => p.seasons.some(s => s.gp >= MIN_SEASON_GP && seasonBPG(s) >= 3),
  "Averaged 2.5+ SPG in a Season": (p: BBGMPlayer) => p.seasons.some(s => s.gp >= MIN_SEASON_GP && seasonSPG(s) >= 2.5),
  "Shot 50/40/90 in a Season": (p: BBGMPlayer) => p.seasons.some(s => {
    const FG = s.fga >= MIN_FGA ? (s.fgp ?? (s.fga ? undefined : undefined)) : undefined;
    const TP = s.tpa >= MIN_3PA ? (s.tpp ?? (s.tpa ? undefined : undefined)) : undefined;
    const FT = s.fta >= MIN_FTA ? (s.ftp ?? (s.fta ? undefined : undefined)) : undefined;
    return FG !== undefined && TP !== undefined && FT !== undefined
        && FG >= 0.50 && TP >= 0.40 && FT >= 0.90;
  }),

  // League Leadership (prefer awards, fall back to computed leader if needed)
  "Led League in Scoring": (p: BBGMPlayer, _L?: LeagueData) =>
    hasAward(p, "Scoring Leader") || hasAward(p, "League Scoring Leader"),
  "Led League in Rebounds": (p: BBGMPlayer, _L?: LeagueData) =>
    hasAward(p, "Rebounding Leader") || hasAward(p, "League Rebounding Leader"),
  "Led League in Assists": (p: BBGMPlayer, _L?: LeagueData) =>
    hasAward(p, "Assists Leader") || hasAward(p, "League Assists Leader"),
  "Led League in Steals": (p: BBGMPlayer, _L?: LeagueData) =>
    hasAward(p, "Steals Leader") || hasAward(p, "League Steals Leader"),
  "Led League in Blocks": (p: BBGMPlayer, _L?: LeagueData) =>
    hasAward(p, "Blocks Leader") || hasAward(p, "League Blocks Leader"),

  // Game Performance Feats (supported only if export includes per-game logs or highs)
  // If your export lacks logs, disable these by returning false unless p.gameHighs exists.
  "Scored 50+ in a Game": (p: any) => !!p.gameHighs?.pts && p.gameHighs.pts >= 50,
  "Triple-Double in a Game": (p: any) => !!p.gameHighs?.trb && !!p.gameHighs?.ast && !!p.gameHighs?.pts
    && p.gameHighs.trb >= 10 && p.gameHighs.ast >= 10 && p.gameHighs.pts >= 10,
  "20+ Rebounds in a Game": (p: any) => !!p.gameHighs?.trb && p.gameHighs.trb >= 20,
  "20+ Assists in a Game": (p: any) => !!p.gameHighs?.ast && p.gameHighs.ast >= 20,
  "10+ Threes in a Game": (p: any) => !!p.gameHighs?.tp && p.gameHighs.tp >= 10,

  // Major Awards (long strings)
  "MVP Winner": (p: BBGMPlayer) => hasAward(p, "Most Valuable Player"),
  "Defensive Player of the Year": (p: BBGMPlayer) => hasAward(p, "Defensive Player of the Year"),
  "Rookie of the Year": (p: BBGMPlayer) => hasAward(p, "Rookie of the Year"),
  "Sixth Man of the Year": (p: BBGMPlayer) => hasAward(p, "Sixth Man of the Year"),
  "Most Improved Player": (p: BBGMPlayer) => hasAward(p, "Most Improved Player"),
  "Finals MVP": (p: BBGMPlayer) => hasAward(p, "Finals MVP"),

  // Team Honors (awards cover these)
  "All-League Team": (p: BBGMPlayer) => hasAward(p, "All-League"),        // matches First/Second/Third Team All-League
  "All-Defensive Team": (p: BBGMPlayer) => hasAward(p, "All-Defensive"),
  "All-Star Selection": (p: BBGMPlayer) => hasAward(p, "All-Star"),
  "NBA Champion": (p: BBGMPlayer) => hasAward(p, "Won Championship"),

  // Career Length & Draft
  "Played 15+ Seasons": (p: BBGMPlayer) => p.seasons.filter(s => s.gp > 0).length >= 15,
  "#1 Overall Draft Pick": (p: BBGMPlayer) => (p.draft.round === 1 && p.draft.pick === 1),
  "Undrafted Player": (p: BBGMPlayer) => !p.draft.round || p.draft.round <= 0 || !p.draft.pick,
  "First Round Pick": (p: BBGMPlayer) => p.draft.round === 1 && !!p.draft.pick,
  "2nd Round Pick": (p: BBGMPlayer) => p.draft.round === 2 && !!p.draft.pick,

  // Special Categories
  "Made All-Star Team at Age 35+": (p: BBGMPlayer) =>
    (p.awards ?? []).some(a => a.type.includes("All-Star") && (() => {
      const age = ageInSeason(p, a.season);
      return age !== undefined && age >= 35;
    })()),
  "Only One Team": (p: BBGMPlayer) => p.teamsPlayed.size === 1,
  "Champion": (p: BBGMPlayer) => hasAward(p, "Won Championship"),
  "Hall of Fame": (p: BBGMPlayer) => !!p.hof || hasAward(p, "Hall of Fame"),
};

// For diagnostics in dev console
export function achievementCounts(L: LeagueData) {
  const entries = Object.entries(Achievements).map(([id, fn]) => {
    let n = 0;
    for (const p of L.players) try { if (fn(p, L)) n++; } catch {}
    return [id, n] as const;
  });
  return Object.fromEntries(entries);
}

// Convert achievement names to match existing grid format
export function getAchievementNames(): string[] {
  return Object.keys(Achievements);
}