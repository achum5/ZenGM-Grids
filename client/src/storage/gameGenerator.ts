// Local game generation without server
import { GridState } from "./localStore";

export interface GeneratedGame {
  id: string;
  columnCriteria: { label: string; type: string; value: string }[];
  rowCriteria: { label: string; type: string; value: string }[];
  correctAnswers: { [key: string]: string[] };
}

// Sample criteria for generating grids from league data
export function generateLocalGame(leagueJson: any): GeneratedGame {
  const players = leagueJson.players || leagueJson;
  const teams = leagueJson.teams || [];
  
  // Extract team names from teams array or player data
  const teamNames = new Set<string>();
  if (teams.length > 0) {
    teams.forEach((team: any) => {
      if (team.region && team.name) {
        teamNames.add(`${team.region} ${team.name}`);
      }
    });
  }
  
  // Fallback: extract teams from players
  players.forEach((player: any) => {
    if (player.teams && Array.isArray(player.teams)) {
      player.teams.forEach((team: string) => teamNames.add(team));
    }
  });
  
  const teamArray = Array.from(teamNames);
  
  // Extract actual achievements from player data
  const achievements = new Set<string>();
  players.forEach((player: any) => {
    if (player.achievements && Array.isArray(player.achievements)) {
      player.achievements.forEach((achievement: string) => achievements.add(achievement));
    }
  });
  
  const achievementArray = Array.from(achievements);
  
  // Generate random criteria
  const gameId = crypto.randomUUID();
  
  // Simple grid generation - could be enhanced
  const columnCriteria = [
    { label: teamArray[Math.floor(Math.random() * teamArray.length)] || "Team A", type: "team", value: teamArray[Math.floor(Math.random() * teamArray.length)] || "Team A" },
    { label: "First Round Pick", type: "achievement", value: "First Round Pick" },
    { label: teamArray[Math.floor(Math.random() * teamArray.length)] || "Team B", type: "team", value: teamArray[Math.floor(Math.random() * teamArray.length)] || "Team B" }
  ];
  
  const rowCriteria = [
    { label: teamArray[Math.floor(Math.random() * teamArray.length)] || "Team C", type: "team", value: teamArray[Math.floor(Math.random() * teamArray.length)] || "Team C" },
    { label: teamArray[Math.floor(Math.random() * teamArray.length)] || "Team D", type: "team", value: teamArray[Math.floor(Math.random() * teamArray.length)] || "Team D" },
    { label: teamArray[Math.floor(Math.random() * teamArray.length)] || "Team E", type: "team", value: teamArray[Math.floor(Math.random() * teamArray.length)] || "Team E" }
  ];
  
  // Generate correct answers for each cell
  const correctAnswers: { [key: string]: string[] } = {};
  
  for (let r = 0; r < rowCriteria.length; r++) {
    for (let c = 0; c < columnCriteria.length; c++) {
      const colCriteria = columnCriteria[c];
      const rowCriteria_item = rowCriteria[r];
      
      let eligiblePlayers: string[] = [];
      
      if (colCriteria.type === "team" && rowCriteria_item.type === "team") {
        // Both are teams - find players who played for both teams
        eligiblePlayers = players
          .filter((p: any) => 
            p.teams && p.teams.includes(colCriteria.value) && p.teams.includes(rowCriteria_item.value)
          )
          .map((p: any) => p.name);
      } else if (colCriteria.type === "team" && rowCriteria_item.type === "achievement") {
        // Team x Achievement - find players who played for team AND have achievement
        eligiblePlayers = players
          .filter((p: any) => 
            p.teams && p.teams.includes(colCriteria.value) && 
            p.achievements && p.achievements.includes(rowCriteria_item.value)
          )
          .map((p: any) => p.name);
      } else if (colCriteria.type === "achievement" && rowCriteria_item.type === "team") {
        // Achievement x Team - find players who have achievement AND played for team
        eligiblePlayers = players
          .filter((p: any) => 
            p.achievements && p.achievements.includes(colCriteria.value) &&
            p.teams && p.teams.includes(rowCriteria_item.value)
          )
          .map((p: any) => p.name);
      }
      
      correctAnswers[`${r}_${c}`] = eligiblePlayers;
    }
  }
  
  return {
    id: gameId,
    columnCriteria,
    rowCriteria,
    correctAnswers
  };
}