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
  // Handle different grid types correctly
  if (row.type === "team" && col.type === "team") {
    // Team × Team grid: player must have played for BOTH teams
    const rowTeamPass = didPlayForTeam(p, row.value);
    const colTeamPass = didPlayForTeam(p, col.value);
    
    // Debug first few checks
    if (Math.random() < 0.01) {
      console.log("🔍 eligibleForCell debug (team×team):", {
        playerName: p.name,
        playerTeams: p.teams?.slice(0, 3),
        rowTeam: row.value,
        colTeam: col.value,
        rowTeamPass,
        colTeamPass,
        eligible: rowTeamPass && colTeamPass
      });
    }
    
    return rowTeamPass && colTeamPass;
  } else {
    // Team × Achievement grid: player must have played for team AND have achievement
    const teamCriteria = row.type === "team" ? row : col;
    const achievementCriteria = row.type === "achievement" ? row : col;
    
    const teamPass = didPlayForTeam(p, teamCriteria.value);
    const critPass = p.achievements.includes(achievementCriteria.value);
    
    // Debug first few checks
    if (Math.random() < 0.01) {
      console.log("🔍 eligibleForCell debug (team×achievement):", {
        playerName: p.name,
        playerTeams: p.teams?.slice(0, 3),
        playerAchievements: p.achievements?.slice(0, 3),
        teamCriteria: teamCriteria.value,
        achievementCriteria: achievementCriteria.value,
        teamPass,
        critPass,
        eligible: teamPass && critPass
      });
    }
    
    return teamPass && critPass;
  }
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
  console.log("🔍 Grid generation debug: Starting with data:", {
    playersCount: data.players?.length,
    teamsCount: data.teams?.length,
    achievementsCount: data.achievements?.length,
    samplePlayerAchievements: data.players?.[0]?.achievements?.slice(0, 5)
  });
  
  const { players } = data;
  
  if (!players || players.length === 0) {
    throw new Error("No players data available. Please upload a league file first.");
  }

  // Get unique teams from player data
  const allTeams = Array.from(new Set(players.flatMap(p => p.teams)));
  console.log("🔍 All teams found:", allTeams.slice(0, 10), `(${allTeams.length} total)`);
  
  // Use all teams that have sufficient players (supports custom leagues)
  const teams = allTeams.filter(team => {
    const teamPlayerCount = players.filter(p => p.teams.includes(team)).length;
    return teamPlayerCount >= 10; // Minimum players for a team to appear in grids
  });
  console.log("🔍 Valid teams (>=10 players):", teams.length, teams.slice(0, 5));
  
  // Use the available achievements from the processed data instead of hardcoded list
  const allAchievements = data.achievements || Array.from(new Set(players.flatMap(p => p.achievements)));
  console.log("🔍 All achievements:", allAchievements.length, allAchievements.slice(0, 10));

  // Filter achievements that have at least 2 players (for valid intersections)
  const availableAchievements = allAchievements.filter(ach => {
    const playersWithAchievement = players.filter(p => p.achievements.includes(ach)).length;
    return playersWithAchievement >= 2;
  });
  console.log("🔍 Available achievements (>=2 players):", availableAchievements.length, availableAchievements.slice(0, 10));
  
  // Uniform sampling - shuffle array
  const achievements = [...availableAchievements].sort(() => Math.random() - 0.5);

  if (teams.length < 3) {
    console.log("❌ Not enough teams:", teams.length);
    throw new Error(`Not enough data to generate a grid. Need at least 3 teams, found ${teams.length}.`);
  }

  console.log("🔍 Starting grid generation attempts with:", {
    teamsCount: teams.length,
    achievementsCount: achievements.length
  });

  // Loop up to 200 attempts to find a valid grid
  for (let attempt = 0; attempt < 200; attempt++) {
    let columnCriteria: GridCriteria[] = [];
    let rowCriteria: GridCriteria[] = [];
    
    // Heavily favor stat-based grids over team-only grids
    const gridType = Math.random();
    
    console.log(`🔍 Attempt ${attempt + 1}: gridType=${gridType.toFixed(3)}, teams=${teams.length}, achievements=${achievements.length}`);
    
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
    
    console.log(`🔍 Attempt ${attempt + 1}: Generated correctAnswers:`, {
      cellCount: Object.keys(correctAnswers).length,
      sampleCell: correctAnswers['0_0']?.length || 0,
      allCellsValid: gridIsValid(correctAnswers)
    });
    
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

  // Fallback: Achievement-heavy grid (much more likely to succeed than team×team)
  if (achievements.length >= 5 && teams.length >= 2) {
    console.log("🔄 Attempting achievement-heavy fallback...");
    const selectedTeams = sampleUniform(teams, 2);
    const selectedAchievements = sampleUniform(achievements, 5);
    
    const columnCriteria = [
      {
        label: selectedTeams[0],
        type: "team" as const,
        value: selectedTeams[0],
      },
      ...selectedAchievements.slice(0, 2).map(achievement => ({
        label: achievement,
        type: "achievement" as const,
        value: achievement,
      }))
    ];
    
    const rowCriteria = [
      {
        label: selectedTeams[1], 
        type: "team" as const,
        value: selectedTeams[1],
      },
      ...selectedAchievements.slice(2, 4).map(achievement => ({
        label: achievement,
        type: "achievement" as const,
        value: achievement,
      }))
    ];
    
    const correctAnswers = buildCorrectAnswers(players, columnCriteria, rowCriteria);
    
    console.log("🔍 Fallback achievement-heavy grid correctAnswers:", {
      cellCount: Object.keys(correctAnswers).length,
      validCells: Object.values(correctAnswers).filter(list => list && list.length > 0).length,
      isValid: Object.values(correctAnswers).every(list => list && list.length > 0)
    });
    
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
  
  // Last resort: Pure achievement grid if we have many achievements
  if (achievements.length >= 6) {
    console.log("🔄 Attempting pure achievement grid...");
    const selectedTeams = sampleUniform(teams, 1);
    const selectedAchievements = sampleUniform(achievements, 6);
    
    const columnCriteria = [
      {
        label: selectedTeams[0],
        type: "team" as const,
        value: selectedTeams[0],
      },
      ...selectedAchievements.slice(0, 2).map(achievement => ({
        label: achievement,
        type: "achievement" as const,
        value: achievement,
      }))
    ];
    
    const rowCriteria = selectedAchievements.slice(2, 5).map(achievement => ({
      label: achievement,
      type: "achievement" as const,
      value: achievement,
    }));
    
    const correctAnswers = buildCorrectAnswers(players, columnCriteria, rowCriteria);
    
    console.log("🔍 Pure achievement grid correctAnswers:", {
      cellCount: Object.keys(correctAnswers).length,
      validCells: Object.values(correctAnswers).filter(list => list && list.length > 0).length,
      isValid: Object.values(correctAnswers).every(list => list && list.length > 0)
    });
    
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
  
  console.log("❌ Failed to generate any valid grid after 200 attempts");
  console.log("📊 Final state:", {
    availableTeams: teams.length,
    availableAchievements: achievements.length,
    sampleTeams: teams.slice(0, 5),
    sampleAchievements: achievements.slice(0, 5)
  });
  
  throw new Error(
    `Couldn't generate a valid grid. Available teams: ${teams.length}, available achievements: ${achievements.length}. Dataset may need more variety.`
  );
}