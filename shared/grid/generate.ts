import { sampleUniform } from "@shared/utils/rng";
import type { GridCriteria, Player } from "@shared/schema";

// Use uniform sampling for fairness
function sample<T>(arr: T[], n: number): T[] {
  return sampleUniform(arr, n);
}

// Simplified eligibility checking for client-side use
function isEligibleForCell(
  player: Player,
  colCriteria: { value: string; type: string },
  rowCriteria: { value: string; type: string }
): boolean {
  // Check team criteria (either row or column)
  const teamCriteria = colCriteria.type === "team" ? colCriteria : rowCriteria;
  const achievementCriteria = colCriteria.type === "achievement" ? colCriteria : rowCriteria;
  
  // Must play for team if there's a team criterion
  if (teamCriteria.type === "team") {
    if (!player.teams.includes(teamCriteria.value)) {
      return false;
    }
  }
  
  // Must have achievement if there's an achievement criterion
  if (achievementCriteria.type === "achievement") {
    if (!player.achievements.includes(achievementCriteria.value)) {
      return false;
    }
  }
  
  return true;
}

function buildCorrectAnswers(
  players: Player[],
  columnCriteria: { value: string; type: string }[],
  rowCriteria: { value: string; type: string }[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  
  for (let r = 0; r < rowCriteria.length; r++) {
    for (let c = 0; c < columnCriteria.length; c++) {
      const colCriteria = columnCriteria[c];
      const rowCriteria_item = rowCriteria[r];
      
      const eligiblePlayers = players.filter(player => 
        isEligibleForCell(player, colCriteria, rowCriteria_item)
      );
      const names = eligiblePlayers.map(p => p.name);
      
      out[`${r}_${c}`] = names;
    }
  }
  return out;
}

function gridIsValid(ca: Record<string, string[]>): boolean {
  // Ensure every cell has at least one valid answer
  return Object.values(ca).every(list => list && list.length > 0);
}

export interface GenerateGridInput {
  players: Player[];
  teams?: string[];
}

export async function generateGrid(input: GenerateGridInput) {
  const { players } = input;
  
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
  
  const allAchievements = Array.from(new Set(players.flatMap(p => p.achievements)));
  
  // Complete list of achievements for uniform sampling
  const ACHIEVEMENTS: readonly string[] = [
    // Career Milestones (6)
    "20,000+ Career Points",
    "10,000+ Career Rebounds", 
    "5,000+ Career Assists",
    "2,000+ Career Steals",
    "1,500+ Career Blocks",
    "2,000+ Made Threes",
    
    // Single-Season Statistical Achievements (6)
    "Averaged 30+ PPG in a Season",
    "Averaged 10+ APG in a Season",
    "Averaged 15+ RPG in a Season", 
    "Averaged 3+ BPG in a Season",
    "Averaged 2.5+ SPG in a Season",
    "Shot 50/40/90 in a Season",
    
    // League Leadership (5)
    "Led League in Scoring",
    "Led League in Rebounds",
    "Led League in Assists",
    "Led League in Steals", 
    "Led League in Blocks",
    
    // Game Performance Feats (5)
    "Scored 50+ in a Game",
    "Triple-Double in a Game",
    "20+ Rebounds in a Game",
    "20+ Assists in a Game",
    "10+ Threes in a Game",
    
    // Major Awards (6)
    "MVP Winner",
    "Defensive Player of the Year", 
    "Rookie of the Year",
    "Sixth Man of the Year",
    "Most Improved Player",
    "Finals MVP",
    
    // Team Honors (4)
    "All-League Team",
    "All-Defensive Team", 
    "All-Star Selection",
    "NBA Champion",
    
    // Career Length & Draft (5)
    "Played 15+ Seasons",
    "#1 Overall Draft Pick",
    "Undrafted Player",
    "First Round Pick",
    "2nd Round Pick",
    
    // Special Categories (5)
    "Made All-Star Team at Age 35+",
    "Only One Team",
    "Champion",
    "Hall of Fame",
    "Teammate of All-Time Greats"
  ];

  // Add dynamic "Teammate of All-Time Greats" criteria based on career Win Shares
  const allTimeGreats = players
    .filter(p => p.careerWinShares && p.careerWinShares >= 150)
    .sort((a, b) => (b.careerWinShares || 0) - (a.careerWinShares || 0))
    .slice(0, 20);
  
  // For each player, check if they were teammates with any all-time greats
  players.forEach(player => {
    for (const great of allTimeGreats) {
      if (player.name !== great.name) {
        const sharedTeams = player.teams.filter(team => great.teams.includes(team));
        if (sharedTeams.length > 0) {
          const playerYears = player.years || [];
          const greatYears = great.years || [];
          
          for (const team of sharedTeams) {
            const playerTeamYears = playerYears.find(y => y.team === team);
            const greatTeamYears = greatYears.find(y => y.team === team);
            
            if (playerTeamYears && greatTeamYears) {
              if (playerTeamYears.start <= greatTeamYears.end && 
                  playerTeamYears.end >= greatTeamYears.start) {
                if (!player.achievements.includes("Teammate of All-Time Greats")) {
                  player.achievements.push("Teammate of All-Time Greats");
                }
                break;
              }
            }
          }
        }
      }
    }
  });
  
  const availableAchievements = ACHIEVEMENTS.filter(ach => {
    const playersWithAchievement = players.filter(p => p.achievements.includes(ach)).length;
    return allAchievements.includes(ach) && playersWithAchievement >= 2;
  });
  
  // Uniform sampling - shuffle array to ensure equal probability for all achievements
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
      // 2% chance: 3 teams x 3 teams grid (very rare pure teams)
      const selectedTeams = sample(teams, 6);
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
      // 23% chance: (2 teams + 1 achievement) x (2 teams + 1 achievement) - mixed grid
      const selectedTeams = sample(teams, 4);
      const selectedAchievements = sample(achievements, 2);
      
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
      // 25% chance: (1 team + 2 achievements) x 3 teams grid
      const selectedTeams = sample(teams, 4);
      const selectedAchievements = sample(achievements, 2);
      
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
      // 25% chance: 3 teams x (1 team + 2 achievements) grid
      const selectedTeams = sample(teams, 4);
      const selectedAchievements = sample(achievements, 2);
      
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
      // 23% chance: (1 team + 2 achievements) x (1 team + 2 achievements) - heavy stats
      const selectedTeams = sample(teams, 2);
      const selectedAchievements = sample(achievements, 4);
      
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
      // 2% chance: Fallback to mixed approach with available data
      const selectedTeams = sample(teams, Math.min(4, teams.length));
      const availableAchievements = sample(achievements, Math.min(2, achievements.length));
      
      if (selectedTeams.length >= 3 && availableAchievements.length >= 1) {
        columnCriteria = selectedTeams.slice(0, 3).map(team => ({
          label: team,
          type: "team",
          value: team,
        }));
        
        const rowTeams = selectedTeams.slice(3, Math.min(4, selectedTeams.length));
        const neededAchievements = Math.max(1, 3 - rowTeams.length);
        const selectedRowAchievements = achievements.length > 0 ? sample(achievements, neededAchievements) : [];
        
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
          const extraAchievement = sample(achievements.filter(a => !rowCriteria.some(r => r.value === a)), 1)[0];
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
      return {
        id: `grid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        columnCriteria,
        rowCriteria,
        correctAnswers,
        createdAt: new Date(),
      };
    }
  }

  // If no valid grid after 200 tries, try a simpler approach
  if (teams.length >= 6) {
    const selectedTeams = sample(teams, 6);
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
      return {
        id: `grid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        columnCriteria,
        rowCriteria,
        correctAnswers,
        createdAt: new Date(),
      };
    }
  }
  
  throw new Error(`Couldn't generate a valid grid. Available teams: ${teams.length}, available achievements: ${achievements.length}. Dataset may need more variety.`);
}