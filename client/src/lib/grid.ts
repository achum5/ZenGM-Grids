import type { GridTeam, GridPlayer } from "./processLeague";

export type Grid = {
  id: string;
  rows: GridCriteria[];
  cols: GridCriteria[];
  correctAnswers: string[][];
};

export type GridCriteria = {
  label: string;
  type: "team" | "achievement";
  value: string;
};

export function buildGrid(data: { teams: GridTeam[]; players: GridPlayer[] }): Grid {
  const { teams, players } = data;
  
  // Simple grid generation - pick teams for criteria
  const availableTeams = teams.filter(t => 
    players.filter(p => p.teams.some(pt => pt.tid === t.tid)).length >= 10
  );
  
  if (availableTeams.length < 6) {
    throw new Error("Not enough teams with sufficient players for grid generation");
  }
  
  // Create a 3x3 grid with teams as criteria
  const rowTeams = availableTeams.slice(0, 3);
  const colTeams = availableTeams.slice(3, 6);
  
  const rows: GridCriteria[] = rowTeams.map(team => ({
    label: team.name,
    type: "team" as const,
    value: team.name
  }));
  
  const cols: GridCriteria[] = colTeams.map(team => ({
    label: team.name,
    type: "team" as const,
    value: team.name
  }));
  
  // Build correct answers matrix
  const correctAnswers: string[][] = [];
  for (let row = 0; row < 3; row++) {
    correctAnswers[row] = [];
    for (let col = 0; col < 3; col++) {
      const rowTeamId = rowTeams[row].tid;
      const colTeamId = colTeams[col].tid;
      
      // Find players who played for both teams
      const matchingPlayers = players.filter(p => 
        p.teams.some(pt => pt.tid === rowTeamId) && 
        p.teams.some(pt => pt.tid === colTeamId)
      );
      
      // Sort by quality/importance if available, otherwise just use first few
      const topPlayers = matchingPlayers
        .slice(0, 10)
        .map(p => p.name);
      
      correctAnswers[row][col] = JSON.stringify(topPlayers);
    }
  }
  
  return {
    id: Date.now().toString(),
    rows,
    cols,
    correctAnswers
  };
}