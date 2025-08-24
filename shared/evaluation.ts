import type { Player, GridCriteria } from "./schema";

export interface EvaluationResult {
  correct: boolean;
  teamPass: boolean;
  critPass: boolean;
  teamLabel: string;
  critLabel: string;
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
    critLabel: criteriaCriteria.label
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

interface DetailedEvaluation {
  correct: boolean;
  leftPass: boolean;
  rightPass: boolean;
  leftType: AxisType;
  rightType: AxisType;
  leftLabel: string;
  rightLabel: string;
}

function describeAxis(type: AxisType, label: string, passed: boolean): string {
  // Teams
  if (type === "team") {
    return passed ? `played for the ${label}` : `didn't play for the ${label}`;
  }

  // Stats/Achievements - natural language templates for all supported criteria
  if (/first\s+overall\s+pick|#1\s+overall/i.test(label)) {
    return passed ? "was a first overall pick" : "was not a first overall pick";
  }
  if (/first\s+round\s+pick/i.test(label)) {
    return passed ? "was a first-round pick" : "was not a first-round pick";
  }
  if (/2nd\s+round\s+pick|second\s+round/i.test(label)) {
    return passed ? "was a second-round pick" : "was not a second-round pick";
  }
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
  if (/30\+?\s*ppg|averaged\s+30/i.test(label)) {
    return passed ? "averaged 30+ PPG in a season" : "did not average 30+ PPG in a season";
  }
  if (/10\+?\s*apg|averaged.*10.*assists/i.test(label)) {
    return passed ? "averaged 10+ APG in a season" : "did not average 10+ APG in a season";
  }
  if (/15\+?\s*rpg|averaged.*15.*rebounds/i.test(label)) {
    return passed ? "averaged 15+ RPG in a season" : "did not average 15+ RPG in a season";
  }
  if (/3\+?\s*bpg|averaged.*3.*blocks/i.test(label)) {
    return passed ? "averaged 3+ BPG in a season" : "did not average 3+ BPG in a season";
  }
  if (/2\.5\+?\s*spg|averaged.*2\.5.*steals/i.test(label)) {
    return passed ? "averaged 2.5+ SPG in a season" : "did not average 2.5+ SPG in a season";
  }
  if (/50\/40\/90/i.test(label)) {
    return passed ? "shot 50/40/90 in a season" : "did not shoot 50/40/90 in a season";
  }
  if (/led\s+league.*scoring/i.test(label)) {
    return passed ? "led the league in scoring" : "did not lead the league in scoring";
  }
  if (/led\s+league.*rebounds/i.test(label)) {
    return passed ? "led the league in rebounds" : "did not lead the league in rebounds";
  }
  if (/led\s+league.*assists/i.test(label)) {
    return passed ? "led the league in assists" : "did not lead the league in assists";
  }
  if (/led\s+league.*steals/i.test(label)) {
    return passed ? "led the league in steals" : "did not lead the league in steals";
  }
  if (/led\s+league.*blocks/i.test(label)) {
    return passed ? "led the league in blocks" : "did not lead the league in blocks";
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

  // Fallback for any unmatched criteria
  return passed ? `met "${label}"` : `did not meet "${label}"`;
}

export function buildIncorrectMessage(playerName: string, evaluation: EvaluationResult): string {
  const ok = (b: boolean) => (b ? "✅" : "❌");
  
  // Convert to detailed evaluation format  
  const teamCriteria = evaluation.teamLabel;
  const critCriteria = evaluation.critLabel;
  
  // Determine axis types and create detailed eval
  const detailed: DetailedEvaluation = {
    correct: evaluation.correct,
    leftPass: evaluation.teamPass,
    rightPass: evaluation.critPass,
    leftType: "team",
    rightType: "stat", 
    leftLabel: teamCriteria,
    rightLabel: critCriteria
  };
  
  const L = describeAxis(detailed.leftType, detailed.leftLabel, detailed.leftPass);
  const R = describeAxis(detailed.rightType, detailed.rightLabel, detailed.rightPass);

  if (!detailed.leftPass && detailed.rightPass) {
    return `${playerName} ${R} (${ok(true)}) but ${L} (${ok(false)}).`;
  }
  if (detailed.leftPass && !detailed.rightPass) {
    return `${playerName} ${L} (${ok(true)}) but ${R} (${ok(false)}).`;
  }
  if (!detailed.leftPass && !detailed.rightPass) {
    return `${playerName} ${L} (${ok(false)}) and ${R} (${ok(false)}).`;
  }
  
  // Safety fallback
  return `${playerName} did not meet all requirements.`;
}