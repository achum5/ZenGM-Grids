import type { Player } from "@shared/schema";

// Types for parsed BBGM data
interface SeasonStats {
  season: number;
  tid: number;
  gp: number;
  min?: number;
  pts: number;
  ast: number;
  stl: number;
  blk: number;
  orb: number;
  drb: number;
  tov: number;
  tp: number;
  tpa: number;
  fg: number;
  fga: number;
  ft: number;
  fta: number;
  ws?: number;
  ows?: number;
  dws?: number;
}

interface PlayerFeat {
  pid: number;
  season: number;
  pts?: number;
  orb?: number;
  drb?: number;
  ast?: number;
  tp?: number;
  td?: number;
}

interface DraftInfo {
  round: number;
  pick: number;
  tid: number;
}

// Eligibility helpers for regular season only
export class EligibilityChecker {
  constructor(private players: Player[]) {}

  // Helper: Check if player ever played for team (≥1 regular season game)
  playedForTeamEver(player: Player, teamName: string): boolean {
    return player.teams.includes(teamName);
  }

  // Helper: Get career totals from stats array (regular season only)
  getCareerTotals(player: Player): {
    pts: number;
    ast: number;
    stl: number;
    blk: number;
    trb: number;
    tp: number;
  } {
    if (!player.stats || !Array.isArray(player.stats)) {
      return { pts: 0, ast: 0, stl: 0, blk: 0, trb: 0, tp: 0 };
    }

    const regularSeasonStats = player.stats.filter((season: any) => !season.playoffs);
    
    return regularSeasonStats.reduce((totals: any, season: any) => ({
      pts: totals.pts + (season.pts || 0),
      ast: totals.ast + (season.ast || 0),
      stl: totals.stl + (season.stl || 0),
      blk: totals.blk + (season.blk || 0),
      trb: totals.trb + ((season.orb || 0) + (season.drb || 0)),
      tp: totals.tp + (season.tp || 0),
    }), { pts: 0, ast: 0, stl: 0, blk: 0, trb: 0, tp: 0 });
  }

  // Helper: Check season averages for any season
  hasSeasonAverage(player: Player, statType: string, threshold: number): boolean {
    if (!player.stats || !Array.isArray(player.stats)) return false;

    const regularSeasonStats = player.stats.filter((season: any) => !season.playoffs);
    
    return regularSeasonStats.some((season: any) => {
      const gp = season.gp || 0;
      if (gp === 0) return false;

      const trb = (season.orb || 0) + (season.drb || 0);
      
      switch (statType) {
        case 'ppg':
          return (season.pts || 0) / gp >= threshold;
        case 'apg':
          return (season.ast || 0) / gp >= threshold;
        case 'rpg':
          return trb / gp >= threshold;
        case 'bpg':
          return (season.blk || 0) / gp >= threshold;
        case 'spg':
          return (season.stl || 0) / gp >= threshold;
        default:
          return false;
      }
    });
  }

  // Helper: Check 50/40/90 shooting for any season
  has504090Season(player: Player): boolean {
    if (!player.stats || !Array.isArray(player.stats)) return false;

    const regularSeasonStats = player.stats.filter((season: any) => !season.playoffs);
    
    return regularSeasonStats.some((season: any) => {
      const fgPct = (season.fga || 0) > 0 ? (season.fg || 0) / (season.fga || 0) : 0;
      const tpPct = (season.tpa || 0) > 0 ? (season.tp || 0) / (season.tpa || 0) : 0;
      const ftPct = (season.fta || 0) > 0 ? (season.ft || 0) / (season.fta || 0) : 0;
      
      return fgPct >= 0.500 && tpPct >= 0.400 && ftPct >= 0.900;
    });
  }

  // Helper: Check if player led league in any category (simplified - using achievements)
  ledLeagueIn(player: Player, category: string): boolean {
    const searchTerms = {
      'ppg': ['Scoring Leader', 'Scoring Champion', 'Led League in Points'],
      'rpg': ['Rebounding Leader', 'Rebounding Champion', 'Led League in Rebounds'],
      'apg': ['Assists Leader', 'Assists Champion', 'Led League in Assists'],
      'spg': ['Steals Leader', 'Steals Champion', 'Led League in Steals'],
      'bpg': ['Blocks Leader', 'Blocks Champion', 'Led League in Blocks']
    };

    const terms = searchTerms[category as keyof typeof searchTerms] || [];
    return terms.some(term => player.achievements.some(achievement => 
      achievement.toLowerCase().includes(term.toLowerCase())
    ));
  }

  // Helper: Check single-game feats (using achievements)
  hasSingleGameFeat(player: Player, featType: string, threshold: number): boolean {
    const searchTerms = {
      'points': [`${threshold}+ Points`, `${threshold} Points`, `Scored ${threshold}`],
      'rebounds': [`${threshold}+ Rebounds`, `${threshold} Rebounds`],
      'assists': [`${threshold}+ Assists`, `${threshold} Assists`],
      'threes': [`${threshold}+ Threes`, `${threshold} Three-Pointers`],
      'triple-double': ['Triple-Double', 'Triple Double']
    };

    const terms = searchTerms[featType as keyof typeof searchTerms] || [];
    return terms.some(term => player.achievements.some(achievement => 
      achievement.toLowerCase().includes(term.toLowerCase())
    ));
  }

  // Helper: Check awards (any season)
  hasAward(player: Player, awardType: string): boolean {
    const awardMap = {
      'mvp': ['MVP', 'Most Valuable Player'],
      'dpoy': ['DPOY', 'Defensive Player of the Year'],
      'roy': ['ROY', 'Rookie of the Year'],
      'smoy': ['SMOY', 'Sixth Man of the Year'],
      'mip': ['MIP', 'Most Improved Player'],
      'finals-mvp': ['Finals MVP', 'Finals Most Valuable Player'],
      'conference-finals-mvp': ['Conference Finals MVP', 'CFMVP'],
      'all-league': ['All-NBA', 'All-League', 'First Team', 'Second Team', 'Third Team'],
      'all-defensive': ['All-Defensive', 'All-Defense'],
      'all-rookie': ['All-Rookie'],
      'all-star': ['All-Star', 'All Star'],
      'champion': ['Champion', 'NBA Champion', 'Title', 'Championship']
    };

    const searchTerms = awardMap[awardType as keyof typeof awardMap] || [];
    return searchTerms.some(term => player.achievements.some(achievement => 
      achievement.toLowerCase().includes(term.toLowerCase())
    ));
  }

  // Helper: Check All-Star at age 35+ (simplified)
  hasAllStarAt35Plus(player: Player): boolean {
    // Simplified: check if player has both All-Star and some age-related achievement
    const hasAllStar = this.hasAward(player, 'all-star');
    const hasAgeRelated = player.achievements.some(achievement => 
      achievement.toLowerCase().includes('age 35') || 
      achievement.toLowerCase().includes('veteran') ||
      achievement.toLowerCase().includes('old')
    );
    return hasAllStar && hasAgeRelated;
  }

  // Helper: Check experience (seasons played)
  getExperience(player: Player): number {
    if (!player.stats || !Array.isArray(player.stats)) return 0;
    
    const regularSeasonStats = player.stats.filter((season: any) => !season.playoffs);
    return regularSeasonStats.filter((season: any) => (season.gp || 0) > 0).length;
  }

  // Helper: Check draft status (FIXED first-round pick bug)
  checkDraftStatus(player: Player, status: string): boolean {
    // Extract draft info from achievements or stats
    const achievements = player.achievements.join(' ').toLowerCase();
    
    switch (status) {
      case 'first-overall':
        return achievements.includes('#1 overall') || 
               achievements.includes('1st overall') ||
               achievements.includes('first overall');
      
      case 'first-round':
        // Fixed: Use round check, not pick number
        return achievements.includes('first round') || 
               achievements.includes('1st round') ||
               achievements.includes('round 1') ||
               this.checkDraftStatus(player, 'first-overall');
      
      case 'undrafted':
        return achievements.includes('undrafted') || 
               achievements.includes('went undrafted');
      
      default:
        return false;
    }
  }

  // Main eligibility function for any cell
  isEligibleForCell(player: Player, columnCriteria: any, rowCriteria: any): boolean {
    // Check column criteria
    const columnMatch = this.checkCriteria(player, columnCriteria);
    
    // Check row criteria  
    const rowMatch = this.checkCriteria(player, rowCriteria);
    
    // Player is eligible if both criteria are met (independently in time)
    return columnMatch && rowMatch;
  }

  // Check individual criteria
  private checkCriteria(player: Player, criteria: any): boolean {
    if (criteria.type === 'team') {
      return this.playedForTeamEver(player, criteria.value);
    }
    
    if (criteria.type === 'achievement') {
      return this.checkAchievementCriteria(player, criteria.value);
    }
    
    return false;
  }

  // Check achievement criteria based on exact specifications
  private checkAchievementCriteria(player: Player, achievement: string): boolean {
    const careerTotals = this.getCareerTotals(player);
    
    switch (achievement) {
      // Career thresholds
      case '20,000+ Points':
        return careerTotals.pts >= 20000;
      case '10,000+ Rebounds':
        return careerTotals.trb >= 10000;
      case '5,000+ Assists':
        return careerTotals.ast >= 5000;
      case '2,000+ Steals':
        return careerTotals.stl >= 2000;
      case '1,500+ Blocks':
        return careerTotals.blk >= 1500;
      case '2,000+ Made Threes':
        return careerTotals.tp >= 2000;

      // Season averages
      case 'Averaged 30+ PPG in a Season':
        return this.hasSeasonAverage(player, 'ppg', 30);
      case 'Averaged 10+ APG in a Season':
        return this.hasSeasonAverage(player, 'apg', 10);
      case 'Averaged 15+ RPG in a Season':
        return this.hasSeasonAverage(player, 'rpg', 15);
      case 'Averaged 3+ BPG in a Season':
        return this.hasSeasonAverage(player, 'bpg', 3);
      case 'Averaged 2.5+ SPG in a Season':
        return this.hasSeasonAverage(player, 'spg', 2.5);
      case '50/40/90 Season':
        return this.has504090Season(player);

      // Led league
      case 'Led League in Points':
        return this.ledLeagueIn(player, 'ppg');
      case 'Led League in Rebounds':
        return this.ledLeagueIn(player, 'rpg');
      case 'Led League in Assists':
        return this.ledLeagueIn(player, 'apg');
      case 'Led League in Steals':
        return this.ledLeagueIn(player, 'spg');
      case 'Led League in Blocks':
        return this.ledLeagueIn(player, 'bpg');

      // Single-game feats
      case '50+ Points in a Game':
        return this.hasSingleGameFeat(player, 'points', 50);
      case '20+ Rebounds in a Game':
        return this.hasSingleGameFeat(player, 'rebounds', 20);
      case '20+ Assists in a Game':
        return this.hasSingleGameFeat(player, 'assists', 20);
      case '10+ Made Threes in a Game':
        return this.hasSingleGameFeat(player, 'threes', 10);
      case 'Triple-Double':
        return this.hasSingleGameFeat(player, 'triple-double', 1);

      // Awards
      case 'MVP':
        return this.hasAward(player, 'mvp');
      case 'DPOY':
        return this.hasAward(player, 'dpoy');
      case 'ROY':
        return this.hasAward(player, 'roy');
      case 'SMOY':
        return this.hasAward(player, 'smoy');
      case 'MIP':
        return this.hasAward(player, 'mip');
      case 'Finals MVP':
        return this.hasAward(player, 'finals-mvp');
      case 'Conference Finals MVP':
        return this.hasAward(player, 'conference-finals-mvp');
      case 'All-League Selection':
        return this.hasAward(player, 'all-league');
      case 'All-Defensive Selection':
        return this.hasAward(player, 'all-defensive');
      case 'All-Rookie Selection':
        return this.hasAward(player, 'all-rookie');
      case 'All-Star Selection':
        return this.hasAward(player, 'all-star');
      case 'All-Star at Age 35+':
        return this.hasAllStarAt35Plus(player);
      case 'NBA Champion':
        return this.hasAward(player, 'champion');

      // Experience
      case '15+ Seasons Played':
        return this.getExperience(player) >= 15;

      // Draft status (FIXED)
      case '#1 Overall Draft Pick':
        return this.checkDraftStatus(player, 'first-overall');
      case 'First Round Pick':
        return this.checkDraftStatus(player, 'first-round');
      case '2nd Round Pick':
        return !this.checkDraftStatus(player, 'first-round') && !this.checkDraftStatus(player, 'undrafted');
      case 'Undrafted':
        return this.checkDraftStatus(player, 'undrafted');

      default:
        // Fallback: check if achievement name is in player's achievements
        return player.achievements.some(a => 
          a.toLowerCase().includes(achievement.toLowerCase()) ||
          achievement.toLowerCase().includes(a.toLowerCase())
        );
    }
  }

  // Get all eligible players for a cell (collect ALL, don't stop at 10)
  getEligiblePlayers(columnCriteria: any, rowCriteria: any): Player[] {
    return this.players.filter(player => 
      this.isEligibleForCell(player, columnCriteria, rowCriteria)
    );
  }

  // Sort eligible players by career Win Shares with fallback proxy
  sortByWinShares(players: Player[]): Player[] {
    return players.sort((a, b) => {
      // Primary: Use careerWinShares if available
      if (a.careerWinShares !== undefined && b.careerWinShares !== undefined) {
        return (b.careerWinShares || 0) - (a.careerWinShares || 0);
      }

      // Secondary: Try to sum WS from stats
      const getWinShares = (player: Player): number => {
        if (!player.stats || !Array.isArray(player.stats)) return 0;
        
        const regularSeasonStats = player.stats.filter((season: any) => !season.playoffs);
        
        return regularSeasonStats.reduce((total: number, season: any) => {
          if (season.ws !== undefined) {
            return total + (season.ws || 0);
          } else if (season.ows !== undefined && season.dws !== undefined) {
            return total + (season.ows || 0) + (season.dws || 0);
          }
          return total;
        }, 0);
      };

      const aWS = getWinShares(a);
      const bWS = getWinShares(b);
      
      if (aWS !== 0 || bWS !== 0) {
        return bWS - aWS;
      }

      // Fallback: Use proxy formula
      const getProxy = (player: Player): number => {
        const totals = this.getCareerTotals(player);
        return totals.pts + 1.2 * totals.ast + 1.1 * totals.trb + 1.5 * totals.stl + 1.6 * totals.blk;
      };

      return getProxy(b) - getProxy(a);
    });
  }
}