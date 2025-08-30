import type { FileUploadData, GridCriteria, Game } from "./schema";

export type BuiltGrid = Game;

// Helper function for uniform sampling
function sampleUniform<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  const result: T[] = [];
  const indices = new Set<number>();
  
  while (result.length < n) {
    const index = Math.floor(Math.random() * arr.length);
    if (!indices.has(index)) {
      indices.add(index);
      result.push(arr[index]);
    }
  }
  
  return result;
}

// Helper functions for team checks and other logic
function didPlayForTeam(player: any, teamName: string): boolean {
  return player.teams.includes(teamName);
}

function eligibleForCell(p: any, row: any, col: any): boolean {
  const teamCriteria = row.type === "team" ? row : col;
  const achievementCriteria = row.type === "achievement" ? row : col;
  
  const teamPass = didPlayForTeam(p, teamCriteria.value);
  const critPass = p.achievements.includes(achievementCriteria.value);
  
  return teamPass && critPass;
}

function buildCorrectAnswers(
  players: any[],
  columnCriteria: { value: string; type: string }[],
  rowCriteria: { value: string; type: string }[]
) {
  const out: Record<string, string[]> = {};
  
  for (let r = 0; r < rowCriteria.length; r++) {
    for (let c = 0; c < columnCriteria.length; c++) {
      const colCriteria = columnCriteria[c];
      const rowCriteria_item = rowCriteria[r];
      
      const eligiblePlayers = players.filter(p => 
        eligibleForCell(p, rowCriteria_item, colCriteria)
      );
      const names = eligiblePlayers.map(p => p.name);
      
      out[`${r}_${c}`] = names;
    }
  }
  
  return out;
}

function gridIsValid(correctAnswers: Record<string, string[]>): boolean {
  return Object.values(correctAnswers).every(answers => answers && answers.length > 0);
}

export function buildGridFromFileUploadData(data: FileUploadData): BuiltGrid {
  const { players } = data;
  
  if (!players || players.length === 0) {
    throw new Error("No players data available. Please upload a league file first.");
  }

  // Get unique teams from player data
  const allTeams = Array.from(new Set(players.flatMap(p => p.teams)));
  
  // Use all teams that have sufficient players (supports custom leagues)
  const teams = allTeams.filter(team => {
    const teamPlayerCount = players.filter(p => p.teams.includes(team)).length;
    return teamPlayerCount >= 10; // Minimum players for a team to appear in grids
  });
  
  // Use the available achievements from the processed data instead of hardcoded list
  const allAchievements = data.achievements || Array.from(new Set(players.flatMap(p => p.achievements)));

  // Filter achievements that have at least 2 players (for valid intersections)
  const availableAchievements = allAchievements.filter(ach => {
    const playersWithAchievement = players.filter(p => p.achievements.includes(ach)).length;
    return playersWithAchievement >= 2;
  });
  
  // Uniform sampling - shuffle array
  const achievements = [...availableAchievements].sort(() => Math.random() - 0.5);

  if (teams.length < 3) {
    throw new Error("Not enough data to generate a grid. Need at least 3 teams.");
  }

  // Loop up to 200 attempts to find a valid grid
  for (let attempt = 0; attempt < 200; attempt++) {
    let columnCriteria: GridCriteria[] = [];
    let rowCriteria: GridCriteria[] = [];
    
    // Heavily favor stat-based grids over team-only grids
    const gridType = Math.random();
    
    if (gridType < 0.02 && teams.length >= 6) {
      // 2% chance: 3 teams x 3 teams grid
      const selectedTeams = sampleUniform(teams, 6);
      columnCriteria = selectedTeams.slice(0, 3).map(team => ({
        label: team,
        type: "team",
        value: team,
      }));
      rowCriteria = selectedTeams.slice(3, 6).map(team => ({
        label: team,
        type: "team", 
        value: team,
      }));
    } else if (gridType < 0.25 && achievements.length >= 1) {
      // 23% chance: mixed grid
      const selectedTeams = sampleUniform(teams, 4);
      const selectedAchievements = sampleUniform(achievements, 2);
      
      columnCriteria = [
        ...selectedTeams.slice(0, 2).map(team => ({
          label: team,
          type: "team",
          value: team,
        })),
        {
          label: selectedAchievements[0],
          type: "achievement", 
          value: selectedAchievements[0],
        }
      ];
      
      rowCriteria = [
        ...selectedTeams.slice(2, 4).map(team => ({
          label: team,
          type: "team",
          value: team,
        })),
        {
          label: selectedAchievements[1],
          type: "achievement",
          value: selectedAchievements[1],
        }
      ];
    } else if (gridType < 0.5 && achievements.length >= 1) {
      // 25% chance: (1 team + 2 achievements) x 3 teams
      const selectedTeams = sampleUniform(teams, 4);
      const selectedAchievements = sampleUniform(achievements, 2);
      
      columnCriteria = [
        {
          label: selectedTeams[0],
          type: "team",
          value: selectedTeams[0],
        },
        ...selectedAchievements.map(achievement => ({
          label: achievement,
          type: "achievement",
          value: achievement,
        }))
      ];
      
      rowCriteria = selectedTeams.slice(1, 4).map(team => ({
        label: team,
        type: "team",
        value: team,
      }));
    } else if (gridType < 0.75 && achievements.length >= 1) {
      // 25% chance: 3 teams x (1 team + 2 achievements)
      const selectedTeams = sampleUniform(teams, 4);
      const selectedAchievements = sampleUniform(achievements, 2);
      
      columnCriteria = selectedTeams.slice(0, 3).map(team => ({
        label: team,
        type: "team",
        value: team,
      }));
      
      rowCriteria = [
        {
          label: selectedTeams[3],
          type: "team",
          value: selectedTeams[3],
        },
        ...selectedAchievements.map(achievement => ({
          label: achievement,
          type: "achievement",
          value: achievement,
        }))
      ];
    } else if (gridType < 0.98 && achievements.length >= 3) {
      // 23% chance: heavy stats
      const selectedTeams = sampleUniform(teams, 2);
      const selectedAchievements = sampleUniform(achievements, 4);
      
      columnCriteria = [
        {
          label: selectedTeams[0],
          type: "team",
          value: selectedTeams[0],
        },
        ...selectedAchievements.slice(0, 2).map(achievement => ({
          label: achievement,
          type: "achievement",
          value: achievement,
        }))
      ];
      
      rowCriteria = [
        {
          label: selectedTeams[1],
          type: "team",
          value: selectedTeams[1],
        },
        ...selectedAchievements.slice(2, 4).map(achievement => ({
          label: achievement,
          type: "achievement",
          value: achievement,
        }))
      ];
    } else {
      // Fallback to mixed approach
      const selectedTeams = sampleUniform(teams, Math.min(4, teams.length));
      const availableAchievements = sampleUniform(achievements, Math.min(2, achievements.length));
      
      if (selectedTeams.length >= 3 && availableAchievements.length >= 1) {
        columnCriteria = selectedTeams.slice(0, 3).map(team => ({
          label: team,
          type: "team",
          value: team,
        }));
        
        const rowTeams = selectedTeams.slice(3, Math.min(4, selectedTeams.length));
        const neededAchievements = Math.max(1, 3 - rowTeams.length);
        const selectedRowAchievements = achievements.length > 0 ? sampleUniform(achievements, neededAchievements) : [];
        
        rowCriteria = [
          ...rowTeams.map(team => ({
            label: team,
            type: "team",
            value: team,
          })),
          ...selectedRowAchievements.map(achievement => ({
            label: achievement,
            type: "achievement",
            value: achievement,
          }))
        ];
        
        // Ensure we always have exactly 3 row criteria
        while (rowCriteria.length < 3 && achievements.length > 0) {
          const extraAchievement = sampleUniform(achievements.filter(a => !rowCriteria.some(r => r.value === a)), 1)[0];
          if (extraAchievement) {
            rowCriteria.push({
              label: extraAchievement,
              type: "achievement",
              value: extraAchievement,
            });
          } else {
            break;
          }
        }
      }
    }

    const correctAnswers = buildCorrectAnswers(players, columnCriteria, rowCriteria);
    
    if (gridIsValid(correctAnswers)) {
      // Generate a random ID for the game
      const id = Math.random().toString(36).substring(2, 15);
      
      return {
        id,
        columnCriteria,
        rowCriteria,
        correctAnswers,
        createdAt: new Date().toISOString()
      };
    }
  }

  // Fallback: Simple team-only grid if we have enough teams
  if (teams.length >= 6) {
    const selectedTeams = sampleUniform(teams, 6);
    const columnCriteria = selectedTeams.slice(0, 3).map(team => ({
      label: team,
      type: "team" as const,
      value: team,
    }));
    const rowCriteria = selectedTeams.slice(3, 6).map(team => ({
      label: team,
      type: "team" as const,
      value: team,
    }));
    
    const correctAnswers = buildCorrectAnswers(players, columnCriteria, rowCriteria);
    
    if (Object.values(correctAnswers).every(list => list && list.length > 0)) {
      const id = Math.random().toString(36).substring(2, 15);
      
      return {
        id,
        columnCriteria,
        rowCriteria,
        correctAnswers,
        createdAt: new Date().toISOString()
      };
    }
  }
  
  throw new Error(
    `Couldn't generate a valid grid. Available teams: ${teams.length}, available achievements: ${achievements.length}. Dataset may need more variety.`
  );
}