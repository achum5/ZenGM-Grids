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

export function buildIncorrectMessage(playerName: string, evaluation: EvaluationResult): string {
  const ok = (b: boolean) => b ? "✅" : "❌";
  
  if (!evaluation.teamPass && evaluation.critPass) {
    return `${playerName} meets "${evaluation.critLabel}" (${ok(true)}) but never played for the ${evaluation.teamLabel} (${ok(false)}).`;
  }
  if (evaluation.teamPass && !evaluation.critPass) {
    return `${playerName} played for the ${evaluation.teamLabel} (${ok(true)}) but does not meet "${evaluation.critLabel}" (${ok(false)}).`;
  }
  return `${playerName} never played for the ${evaluation.teamLabel} (${ok(false)}) and does not meet "${evaluation.critLabel}" (${ok(false)}).`;
}