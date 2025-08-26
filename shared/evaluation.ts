import type { Player, GridCriteria } from "./schema";

export interface EvaluationResult {
  correct: boolean;
  teamPass: boolean;
  critPass: boolean;
  teamLabel: string;
  critLabel: string;
  player?: Player; // Add player data for stat values
}

export function evaluatePlayerAnswer(
  player: Player,
  columnCriteria: GridCriteria,
  rowCriteria: GridCriteria
): EvaluationResult {
  // Determine which is team and which is criterion
  const teamCriteria = columnCriteria.type === "team" ? columnCriteria : rowCriteria;
  const criteriaCriteria = columnCriteria.type === "achievement" ? columnCriteria : rowCriteria;
  
  const teamPass = didPlayForTeam(player, teamCriteria.value);
  const critPass = meetsCriterion(player, criteriaCriteria.value);
  const correct = teamPass && critPass;
  
  return {
    correct,
    teamPass,
    critPass,
    teamLabel: teamCriteria.label,
    critLabel: criteriaCriteria.label,
    player // Include player data for stat values
  };
}

export function didPlayForTeam(player: Player, teamName: string): boolean {
  // Check if player played for team (≥1 game at any time, regular season or playoffs)
  // Also check the teams array as backup
  return player.teams.includes(teamName);
}

export function meetsCriterion(player: Player, criterion: string): boolean {
  // Career-wide check - not tied to specific team
  return player.achievements.includes(criterion);
}

type AxisType = "team" | "stat";

// Helper function to get actual stat values for a player
function getActualStatValue(player: Player | undefined, label: string): string | null {
  if (!player || !player.stats || !Array.isArray(player.stats)) return null;
  
  const regularSeasonStats = player.stats.filter((season: any) => !season.playoffs);
  
  // Career totals
  if (/20,000\+?\s*(career\s+)?points/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => sum + (season.pts || 0), 0);
    return total.toLocaleString();
  }
  if (/10,000\+?\s*(career\s+)?rebounds/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => sum + ((season.orb || 0) + (season.drb || 0)), 0);
    return total.toLocaleString();
  }
  if (/5,000\+?\s*(career\s+)?assists/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => sum + (season.ast || 0), 0);
    return total.toLocaleString();
  }
  if (/2,000\+?\s*(career\s+)?steals/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => sum + (season.stl || 0), 0);
    return total.toLocaleString();
  }
  if (/1,500\+?\s*(career\s+)?blocks/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => sum + (season.blk || 0), 0);
    return total.toLocaleString();
  }
  if (/2,000\+?\s*made\s+threes/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => sum + (season.tp || 0), 0);
    return total.toLocaleString();
  }
  
  // Season highs
  if (/30\+?\s*ppg|averaged\s+30/i.test(label)) {
    const maxPpg = Math.max(...regularSeasonStats.map((s: any) => s.ppg || 0));
    return maxPpg > 0 ? maxPpg.toFixed(1) : "0.0";
  }
  if (/10\+?\s*apg|averaged.*10.*assists/i.test(label)) {
    const maxApg = Math.max(...regularSeasonStats.map((s: any) => s.apg || 0));
    return maxApg > 0 ? maxApg.toFixed(1) : "0.0";
  }
  if (/15\+?\s*rpg|averaged.*15.*rebounds/i.test(label)) {
    const maxRpg = Math.max(...regularSeasonStats.map((s: any) => s.rpg || 0));
    return maxRpg > 0 ? maxRpg.toFixed(1) : "0.0";
  }
  
  // Team count for "Only One Team"
  if (/only\s+one\s+team/i.test(label)) {
    return player.teams?.length?.toString() || "0";
  }
  
  return null;
}

interface DetailedEvaluation {
  correct: boolean;
  leftPass: boolean;
  rightPass: boolean;
  leftType: AxisType;
  rightType: AxisType;
  leftLabel: string;
  rightLabel: string;
}

// Phrase dictionary for affirmative and negative descriptions per the specification
function getAchievementPhrase(label: string, passed: boolean): string {
  // Career totals
  if (/20,000\+?\s*(career\s+)?points/i.test(label)) {
    return passed ? "had 20,000+ career points" : "did not have 20,000+ career points";
  }
  if (/10,000\+?\s*(career\s+)?rebounds/i.test(label)) {
    return passed ? "had 10,000+ career rebounds" : "did not have 10,000+ career rebounds";
  }
  if (/5,000\+?\s*(career\s+)?assists/i.test(label)) {
    return passed ? "had 5,000+ career assists" : "did not have 5,000+ career assists";
  }
  if (/2,000\+?\s*(career\s+)?steals/i.test(label)) {
    return passed ? "had 2,000+ career steals" : "did not have 2,000+ career steals";
  }
  if (/1,500\+?\s*(career\s+)?blocks/i.test(label)) {
    return passed ? "had 1,500+ career blocks" : "did not have 1,500+ career blocks";
  }
  if (/2,000\+?\s*made\s+threes/i.test(label)) {
    return passed ? "made 2,000+ career threes" : "did not make 2,000+ career threes";
  }

  // Season averages / efficiency
  if (/30\+?\s*ppg|averaged\s+30/i.test(label)) {
    return passed ? "averaged 30+ PPG in a season" : "did not average 30+ PPG in any season";
  }
  if (/10\+?\s*apg|averaged.*10.*assists/i.test(label)) {
    return passed ? "averaged 10+ APG in a season" : "did not average 10+ APG in any season";
  }
  if (/15\+?\s*rpg|averaged.*15.*rebounds/i.test(label)) {
    return passed ? "averaged 15+ RPG in a season" : "did not average 15+ RPG in any season";
  }
  if (/3\+?\s*bpg|averaged.*3.*blocks/i.test(label)) {
    return passed ? "averaged 3+ BPG in a season" : "did not average 3+ BPG in any season";
  }
  if (/2\.5\+?\s*spg|averaged.*2\.5.*steals/i.test(label)) {
    return passed ? "averaged 2.5+ SPG in a season" : "did not average 2.5+ SPG in any season";
  }
  if (/50\/40\/90/i.test(label)) {
    return passed ? "recorded a 50/40/90 season" : "never recorded a 50/40/90 season";
  }

  // Draft status / career length
  if (/first\s+overall\s+pick|#1\s+overall/i.test(label)) {
    return passed ? "was the No. 1 overall pick" : "was not the No. 1 overall pick";
  }
  if (/first\s+round\s+pick/i.test(label)) {
    return passed ? "was a first-round pick" : "was not a first-round pick";
  }
  if (/2nd\s+round\s+pick|second\s+round/i.test(label)) {
    return passed ? "was a second-round pick" : "was not a second-round pick";
  }
  if (/undrafted/i.test(label)) {
    return passed ? "went undrafted" : "was drafted";
  }
  if (/15\+?\s*seasons|played.*15.*seasons/i.test(label)) {
    return passed ? "played at least 15 NBA seasons" : "did not play at least 15 NBA seasons";
  }
  if (/only\s+one\s+team/i.test(label)) {
    return passed ? "spent their entire NBA career with one franchise" : "did not spend their entire NBA career with one franchise";
  }

  // League-leading (any season)
  if (/led\s+league.*scoring/i.test(label)) {
    return passed ? "led the league in scoring at least once" : "never led the league in scoring";
  }
  if (/led\s+league.*rebounds/i.test(label)) {
    return passed ? "led the league in rebounds at least once" : "never led the league in rebounds";
  }
  if (/led\s+league.*assists/i.test(label)) {
    return passed ? "led the league in assists at least once" : "never led the league in assists";
  }
  if (/led\s+league.*steals/i.test(label)) {
    return passed ? "led the league in steals at least once" : "never led the league in steals";
  }
  if (/led\s+league.*blocks/i.test(label)) {
    return passed ? "led the league in blocks at least once" : "never led the league in blocks";
  }

  // Single-game feats
  if (/50\+.*game|scored\s+50/i.test(label)) {
    return passed ? "scored 50+ points in a game" : "never scored 50+ points in a game";
  }
  if (/triple.?double/i.test(label)) {
    return passed ? "recorded a triple-double" : "never recorded a triple-double";
  }
  if (/20\+.*rebounds.*game/i.test(label)) {
    return passed ? "grabbed 20+ rebounds in a game" : "never grabbed 20+ rebounds in a game";
  }
  if (/20\+.*assists.*game/i.test(label)) {
    return passed ? "dished 20+ assists in a game" : "never dished 20+ assists in a game";
  }
  if (/10\+.*threes.*game/i.test(label)) {
    return passed ? "made 10+ threes in a game" : "never made 10+ threes in a game";
  }

  // Awards / teams
  if (/all.?star|all\s+star/i.test(label)) {
    return passed ? "was an All-Star" : "was not an All-Star";
  }
  if (/mvp\s+winner|mvp/i.test(label) && !/finals/i.test(label)) {
    return passed ? "won MVP" : "never won MVP";
  }
  if (/defensive\s+player/i.test(label)) {
    return passed ? "won Defensive Player of the Year" : "never won Defensive Player of the Year";
  }
  if (/rookie.*year|roty/i.test(label)) {
    return passed ? "won Rookie of the Year" : "never won Rookie of the Year";
  }
  if (/6th\s+man|sixth\s+man/i.test(label)) {
    return passed ? "won Sixth Man of the Year" : "never won Sixth Man of the Year";
  }
  if (/most\s+improved/i.test(label)) {
    return passed ? "won Most Improved Player" : "never won Most Improved Player";
  }
  if (/finals\s+mvp/i.test(label)) {
    return passed ? "won Finals MVP" : "never won Finals MVP";
  }
  if (/all.?league|all.?nba|all\s+nba/i.test(label)) {
    return passed ? "made an All-NBA Team" : "never made an All-NBA Team";
  }
  if (/all.?defense|all\s+defensive/i.test(label)) {
    return passed ? "made an All-Defensive Team" : "never made an All-Defensive Team";
  }
  if (/nba\s+champion/i.test(label)) {
    return passed ? "won an NBA championship" : "never won an NBA championship";
  }
  if (/made.*all.?star.*age.*35/i.test(label)) {
    return passed ? "made an All-Star Team at age 35 or older" : "never made an All-Star Team at age 35 or older";
  }
  if (/champion/i.test(label) && !/nba/i.test(label)) {
    return passed ? "won a championship" : "never won a championship";
  }
  if (/hall\s+of\s+fame/i.test(label)) {
    return passed ? "is in the Hall of Fame" : "is not in the Hall of Fame";
  }

  // Fallback for any unmatched criteria
  return passed ? `met "${label}"` : `did not meet "${label}"`;
}

function getTeamPhrase(teamName: string, passed: boolean): string {
  return passed ? `played for the ${teamName}` : `never played for the ${teamName}`;
}

export function buildIncorrectMessage(playerName: string, evaluation: EvaluationResult): string {
  // Get the phrases for team and achievement
  const teamPhrase = getTeamPhrase(evaluation.teamLabel, evaluation.teamPass);
  const achievementPhrase = getAchievementPhrase(evaluation.critLabel, evaluation.critPass);
  
  // Apply the core grammar rules from the specification
  // Rule: if meetsA and not meetsB: {Player} {affirm(A)} but {neg(B)}.
  if (evaluation.teamPass && !evaluation.critPass) {
    return `${playerName} ${teamPhrase} but ${achievementPhrase}.`;
  }
  
  // Rule: if meetsB and not meetsA: {Player} {affirm(B)} but {neg(A)}.
  if (!evaluation.teamPass && evaluation.critPass) {
    return `${playerName} ${achievementPhrase} but ${teamPhrase}.`;
  }
  
  // Rule: if neither is met: {Player} {neg(A)} and {neg(B)}.
  if (!evaluation.teamPass && !evaluation.critPass) {
    return `${playerName} ${teamPhrase} and ${achievementPhrase}.`;
  }
  
  // Safety fallback (should not reach here for incorrect answers)
  return `${playerName} did not meet all requirements.`;
}