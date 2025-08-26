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
  // Handle team vs team case first per spec point 7
  if (columnCriteria.type === "team" && rowCriteria.type === "team") {
    const colTeamPass = didPlayForTeam(player, columnCriteria.value);
    const rowTeamPass = didPlayForTeam(player, rowCriteria.value);
    const correct = colTeamPass && rowTeamPass;
    
    return {
      correct,
      teamPass: colTeamPass,
      critPass: rowTeamPass,
      teamLabel: columnCriteria.label,
      critLabel: rowCriteria.label,
      player
    };
  }
  
  // Standard team vs achievement case
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
    player
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

// Formatting helpers per spec
function fmtInt(n: number): string { return n.toLocaleString("en-US"); }
function fmt1(n: number): string { return (Math.round(n * 10) / 10).toFixed(1); }
function pct(n: number): string { return fmt1(100 * n) + "%"; }

// Helper function to get exact stat values with proper formatting per spec 4.B.2
function getStatParentheses(player: Player | undefined, label: string, passed: boolean): string {
  if (!player || !player.stats || !Array.isArray(player.stats)) return "";
  
  const regularSeasonStats = player.stats.filter((season: any) => !season.playoffs);
  if (regularSeasonStats.length === 0) return "";
  
  // 4.B.2(a) Career totals
  if (/20,000\+?\s*(career\s+)?points/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => sum + (season.pts || 0), 0);
    return `(${fmtInt(total)})`;
  }
  if (/10,000\+?\s*(career\s+)?rebounds/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => {
      const reb = season.trb !== undefined ? season.trb : (season.orb || 0) + (season.drb || 0);
      return sum + reb;
    }, 0);
    return `(${fmtInt(total)})`;
  }
  if (/5,000\+?\s*(career\s+)?assists/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => sum + (season.ast || 0), 0);
    return `(${fmtInt(total)})`;
  }
  if (/2,000\+?\s*(career\s+)?steals/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => sum + (season.stl || 0), 0);
    return `(${fmtInt(total)})`;
  }
  if (/1,500\+?\s*(career\s+)?blocks/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => sum + (season.blk || 0), 0);
    return `(${fmtInt(total)})`;
  }
  if (/2,000\+?\s*made\s+threes/i.test(label)) {
    const total = regularSeasonStats.reduce((sum: number, season: any) => sum + (season.tp || 0), 0);
    return `(${fmtInt(total)})`;
  }
  
  // 4.B.2(b) Season averages  
  if (/30\+?\s*ppg|averaged\s+30/i.test(label)) {
    const seasonsWithGames = regularSeasonStats.filter((s: any) => (s.gp || 0) >= 1);
    if (seasonsWithGames.length === 0) return "";
    const maxPpg = Math.max(...seasonsWithGames.map((s: any) => (s.pts || 0) / (s.gp || 1)));
    return `(${fmt1(maxPpg)} PPG)`;
  }
  if (/10\+?\s*apg|averaged.*10.*assists/i.test(label)) {
    const seasonsWithGames = regularSeasonStats.filter((s: any) => (s.gp || 0) >= 1);
    if (seasonsWithGames.length === 0) return "";
    const maxApg = Math.max(...seasonsWithGames.map((s: any) => (s.ast || 0) / (s.gp || 1)));
    return `(${fmt1(maxApg)} APG)`;
  }
  if (/15\+?\s*rpg|averaged.*15.*rebounds/i.test(label)) {
    const seasonsWithGames = regularSeasonStats.filter((s: any) => (s.gp || 0) >= 1);
    if (seasonsWithGames.length === 0) return "";
    const maxRpg = Math.max(...seasonsWithGames.map((s: any) => {
      const reb = s.trb !== undefined ? s.trb : (s.orb || 0) + (s.drb || 0);
      return reb / (s.gp || 1);
    }));
    return `(${fmt1(maxRpg)} RPG)`;
  }
  
  // 4.B.2(k) Career meta
  if (/only\s+one\s+team/i.test(label)) {
    const teamCount = player.teams?.length || 0;
    return `(${teamCount} team${teamCount !== 1 ? 's' : ''})`;
  }
  if (/15\+?\s*seasons|played.*15.*seasons/i.test(label)) {
    const seasonCount = regularSeasonStats.filter((s: any) => (s.gp || 0) >= 1).length;
    return `(${seasonCount} season${seasonCount !== 1 ? 's' : ''})`;
  }
  
  return "";
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

function describeAxis(type: AxisType, label: string, passed: boolean, player?: Player): string {
  const parentheses = passed ? "" : " " + getStatParentheses(player, label, passed);
  
  // Teams
  if (type === "team") {
    return passed ? `played for the ${label}` : `did not play for the ${label}`;
  }

  // Stats/Achievements - natural language templates for all supported criteria
  if (/first\s+overall\s+pick|#1\s+overall/i.test(label)) {
    return passed ? `was a first overall pick${parentheses}` : `was not a first overall pick${parentheses}`;
  }
  if (/first\s+round\s+pick/i.test(label)) {
    return passed ? `was a first-round pick${parentheses}` : `was not a first-round pick${parentheses}`;
  }
  if (/2nd\s+round\s+pick|second\s+round/i.test(label)) {
    return passed ? `was a second-round pick${parentheses}` : `was not a second-round pick${parentheses}`;
  }
  if (/20,000\+?\s*(career\s+)?points/i.test(label)) {
    return passed ? `had 20,000+ career points${parentheses}` : `did not have 20,000+ career points${parentheses}`;
  }
  if (/10,000\+?\s*(career\s+)?rebounds/i.test(label)) {
    return passed ? `had 10,000+ career rebounds${parentheses}` : `did not have 10,000+ career rebounds${parentheses}`;
  }
  if (/5,000\+?\s*(career\s+)?assists/i.test(label)) {
    return passed ? `had 5,000+ career assists${parentheses}` : `did not have 5,000+ career assists${parentheses}`;
  }
  if (/2,000\+?\s*(career\s+)?steals/i.test(label)) {
    return passed ? `had 2,000+ career steals${parentheses}` : `did not have 2,000+ career steals${parentheses}`;
  }
  if (/1,500\+?\s*(career\s+)?blocks/i.test(label)) {
    return passed ? `had 1,500+ career blocks${parentheses}` : `did not have 1,500+ career blocks${parentheses}`;
  }
  if (/2,000\+?\s*made\s+threes/i.test(label)) {
    return passed ? `made 2,000+ career threes${parentheses}` : `did not make 2,000+ career threes${parentheses}`;
  }
  if (/30\+?\s*ppg|averaged\s+30/i.test(label)) {
    return passed ? `averaged 30+ PPG in a season${parentheses}` : `did not average 30+ PPG in a season${parentheses}`;
  }
  if (/10\+?\s*apg|averaged.*10.*assists/i.test(label)) {
    return passed ? `averaged 10+ APG in a season${parentheses}` : `did not average 10+ APG in a season${parentheses}`;
  }
  if (/15\+?\s*rpg|averaged.*15.*rebounds/i.test(label)) {
    return passed ? `averaged 15+ RPG in a season${parentheses}` : `did not average 15+ RPG in a season${parentheses}`;
  }
  if (/3\+?\s*bpg|averaged.*3.*blocks/i.test(label)) {
    return passed ? "averaged 3+ BPG in a season" : "did not average 3+ BPG in a season";
  }
  if (/2\.5\+?\s*spg|averaged.*2\.5.*steals/i.test(label)) {
    return passed ? "averaged 2.5+ SPG in a season" : "did not average 2.5+ SPG in a season";
  }
  if (/50\/40\/90/i.test(label)) {
    return passed ? `recorded a 50/40/90 season${parentheses}` : `did not record a 50/40/90 season${parentheses}`;
  }
  if (/led\s+league.*scoring/i.test(label)) {
    return passed ? `led the league in scoring${parentheses}` : `did not lead the league in scoring${parentheses}`;
  }
  if (/led\s+league.*rebounds/i.test(label)) {
    return passed ? `led the league in rebounds${parentheses}` : `did not lead the league in rebounds${parentheses}`;
  }
  if (/led\s+league.*assists/i.test(label)) {
    return passed ? `led the league in assists${parentheses}` : `did not lead the league in assists${parentheses}`;
  }
  if (/led\s+league.*steals/i.test(label)) {
    return passed ? `led the league in steals${parentheses}` : `did not lead the league in steals${parentheses}`;
  }
  if (/led\s+league.*blocks/i.test(label)) {
    return passed ? `led the league in blocks${parentheses}` : `did not lead the league in blocks${parentheses}`;
  }
  if (/50\+.*game|scored\s+50/i.test(label)) {
    return passed ? "scored 50+ in a game" : "did not score 50+ in a game";
  }
  if (/triple.?double/i.test(label)) {
    return passed ? "recorded a triple-double" : "did not record a triple-double";
  }
  if (/20\+.*rebounds.*game/i.test(label)) {
    return passed ? "had 20+ rebounds in a game" : "did not have 20+ rebounds in a game";
  }
  if (/20\+.*assists.*game/i.test(label)) {
    return passed ? "had 20+ assists in a game" : "did not have 20+ assists in a game";
  }
  if (/10\+.*threes.*game/i.test(label)) {
    return passed ? "made 10+ threes in a game" : "did not make 10+ threes in a game";
  }
  if (/mvp\s+winner|mvp/i.test(label)) {
    return passed ? "won MVP" : "did not win MVP";
  }
  if (/defensive\s+player/i.test(label)) {
    return passed ? "won Defensive Player of the Year" : "did not win Defensive Player of the Year";
  }
  if (/6th\s+man|sixth\s+man/i.test(label)) {
    return passed ? "won Sixth Man of the Year" : "did not win Sixth Man of the Year";
  }
  if (/rookie.*year|roty/i.test(label)) {
    return passed ? "won Rookie of the Year" : "did not win Rookie of the Year";
  }
  if (/finals\s+mvp/i.test(label)) {
    return passed ? "won Finals MVP" : "did not win Finals MVP";
  }
  if (/all.?star|all\s+star/i.test(label)) {
    return passed ? "made an All-Star team" : "did not make an All-Star team";
  }
  if (/all.?nba|all\s+nba/i.test(label)) {
    return passed ? "made an All-NBA team" : "did not make an All-NBA team";
  }
  if (/all.?defense|all\s+defensive/i.test(label)) {
    return passed ? "made an All-Defensive team" : "did not make an All-Defensive team";
  }
  if (/hall\s+of\s+fame/i.test(label)) {
    return passed ? "is in the Hall of Fame" : "is not in the Hall of Fame";
  }
  if (/champion|championship/i.test(label)) {
    return passed ? "won a championship" : "did not win a championship";
  }
  if (/15\+?\s*seasons|played.*15.*seasons/i.test(label)) {
    return passed ? `played 15+ seasons${parentheses}` : `did not play 15+ seasons${parentheses}`;
  }
  if (/only\s+one\s+team/i.test(label)) {
    return passed ? `played for only one team${parentheses}` : `did not play for only one team${parentheses}`;
  }

  // Fallback for any unmatched criteria
  return passed ? `met "${label}"${parentheses}` : `did not meet "${label}"${parentheses}`;
}

export function buildIncorrectMessage(playerName: string, evaluation: EvaluationResult): string {
  // Determine if we have team vs team case by checking if both labels are team names (no achievement keywords)
  const achievementKeywords = ['PPG', 'APG', 'RPG', 'MVP', 'All-Star', 'Champion', 'Finals', 'Points', 'Rebounds', 'Assists', 'Blocks', 'Steals', 'Draft', 'Rookie', 'Hall of Fame', 'season', 'career', 'game', 'Overall', 'Round', 'Led League'];
  const teamLabelIsAchievement = achievementKeywords.some(keyword => evaluation.teamLabel.includes(keyword));
  const critLabelIsAchievement = achievementKeywords.some(keyword => evaluation.critLabel.includes(keyword));
  
  // Determine axis types and create detailed eval
  const detailed: DetailedEvaluation = {
    correct: evaluation.correct,
    leftPass: evaluation.teamPass,
    rightPass: evaluation.critPass,
    leftType: "team",
    rightType: (!teamLabelIsAchievement && !critLabelIsAchievement) ? "team" : "stat", 
    leftLabel: evaluation.teamLabel,
    rightLabel: evaluation.critLabel
  };
  
  const L = describeAxis(detailed.leftType, detailed.leftLabel, detailed.leftPass, evaluation.player);
  const R = describeAxis(detailed.rightType, detailed.rightLabel, detailed.rightPass, evaluation.player);

  // Add color styling based on pass/fail per spec
  const colorL = detailed.leftPass ? `<span class="text-green-600">${L}</span>` : `<span class="text-red-600">${L}</span>`;
  const colorR = detailed.rightPass ? `<span class="text-green-600">${R}</span>` : `<span class="text-red-600">${R}</span>`;

  // Special case: team vs team per spec point 7
  if (detailed.leftType === "team" && detailed.rightType === "team") {
    if (!detailed.leftPass && !detailed.rightPass) {
      return `<span class="text-red-600">${playerName} played for neither the ${detailed.leftLabel} nor the ${detailed.rightLabel}</span>.`;
    } else if (!detailed.leftPass && detailed.rightPass) {
      return `${playerName} <span class="text-green-600">played for the ${detailed.rightLabel}</span> but <span class="text-red-600">did not play for the ${detailed.leftLabel}</span>.`;
    } else if (detailed.leftPass && !detailed.rightPass) {
      return `${playerName} <span class="text-green-600">played for the ${detailed.leftLabel}</span> but <span class="text-red-600">did not play for the ${detailed.rightLabel}</span>.`;
    }
  }

  // Standard cases with natural language and colors per spec 4.A  
  if (!detailed.leftPass && detailed.rightPass) {
    return `${playerName} ${colorR} but ${colorL}.`;
  }
  if (detailed.leftPass && !detailed.rightPass) {
    return `${playerName} ${colorL} but ${colorR}.`;
  }
  if (!detailed.leftPass && !detailed.rightPass) {
    return `${playerName} ${colorL} and ${colorR}.`;
  }
  
  // Safety fallback
  return `${playerName} did not meet all requirements.`;
}