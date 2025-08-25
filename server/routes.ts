import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";

import { z } from "zod";
import { gunzip } from "zlib";
import { promisify } from "util";
import { insertPlayerSchema, insertGameSchema, insertGameSessionSchema, type FileUploadData, type GridCriteria } from "@shared/schema";
import { EligibilityChecker } from "./eligibility";
import { sampleUniform } from "@shared/utils/rng";

const gunzipAsync = promisify(gunzip);

// Use uniform sampling for fairness
function sample<T>(arr: T[], n: number): T[] {
  return sampleUniform(arr, n);
}

function buildCorrectAnswers(
  players: any[],
  columnCriteria: { value: string; type: string }[],
  rowCriteria: { value: string; type: string }[]
) {
  const eligibilityChecker = new EligibilityChecker(players);
  const out: Record<string, string[]> = {};
  
  for (let r = 0; r < rowCriteria.length; r++) {
    for (let c = 0; c < columnCriteria.length; c++) {
      const colCriteria = columnCriteria[c];
      const rowCriteria_item = rowCriteria[r];
      
      // Use new eligibility system - decoupled team/achievement logic
      const eligiblePlayers = eligibilityChecker.getEligiblePlayers(colCriteria, rowCriteria_item);
      const names = eligiblePlayers.map(p => p.name);
      
      out[`${r}_${c}`] = names; // keep underscore key format
    }
  }
  return out;
}

function gridIsValid(ca: Record<string, string[]>) {
  // Ensure every cell has at least one valid answer
  const allCellsHaveAnswers = Object.values(ca).every(list => list && list.length > 0);
  
  if (!allCellsHaveAnswers) {
    return false;
  }
  
  // Just ensure all cells have answers - remove difficulty constraint for now
  return true;
}

// Career quality scoring system helpers
function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function percentileOf(sortedAsc: number[], v: number): number {
  if (!sortedAsc.length) return 50;
  let lo = 0, hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return Math.round(100 * (lo - 0.5) / sortedAsc.length);
}

interface SeasonStats {
  mp?: number;
  ws?: number;
  ws48?: number;
  bpm?: number;
  [key: string]: any;
}

function deriveCareerAggregates(players: any[]) {
  for (const p of players) {
    const seasons = p.stats && Array.isArray(p.stats) ? p.stats : [];
    
    const mins = seasons.reduce((s: number, szn: SeasonStats) => s + (szn.mp ?? 0), 0);
    const ws = seasons.reduce((s: number, szn: SeasonStats) => s + (szn.ws ?? 0), 0);

    // Minutes-weighted BPM
    const wBpmNum = seasons.reduce((s: number, szn: SeasonStats) => s + (szn.bpm ?? 0) * (szn.mp ?? 0), 0);
    const wBpmDen = mins || 1;
    const bpmW = wBpmNum / wBpmDen;

    // Peak WS/48 with >= 1000 minutes to avoid tiny samples
    let peak = -Infinity;
    for (const s of seasons) {
      const m = s.mp ?? 0;
      const w48 = s.ws48 ?? 0;
      if (m >= 1000 && Number.isFinite(w48)) peak = Math.max(peak, w48);
    }
    if (!Number.isFinite(peak)) peak = 0;

    p.careerMinutes = mins;
    p.careerWS = ws;
    p.careerBPM_weighted = bpmW;
    p.peakWS48 = peak;
  }
}

function assignQuality(players: any[]) {
  // Build arrays for percentiles
  const arrWS = players.map(p => p.careerWS ?? 0).sort((a, b) => a - b);
  const arrWS48 = players.map(p => p.peakWS48 ?? 0).sort((a, b) => a - b);
  const arrBPM = players.map(p => p.careerBPM_weighted ?? 0).sort((a, b) => a - b);

  for (const p of players) {
    const pWS = percentileOf(arrWS, p.careerWS ?? 0);
    const pWS48 = percentileOf(arrWS48, p.peakWS48 ?? 0);
    const pBPM = percentileOf(arrBPM, p.careerBPM_weighted ?? 0);

    const blended = 0.60 * pWS + 0.25 * pWS48 + 0.15 * pBPM;
    const r = clamp((p.careerMinutes ?? 0) / 6000, 0, 1);
    const quality = Math.round(r * blended + (1 - r) * 50);
    p.quality = clamp(quality, 1, 99);
  }
}


interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const upload = multer({ storage: multer.memoryStorage() });

// Validation schemas
const searchQuerySchema = z.object({
  q: z.string().min(1),
});

const answerSchema = z.object({
  row: z.number().min(0).max(2),
  col: z.number().min(0).max(2),
  player: z.string(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Debug endpoint to manually process league-level achievements on existing data
  app.post("/api/debug/process-league-achievements", async (req, res) => {
    try {
      console.log("🔧 DEBUG: Manually processing league-level achievements...");
      
      // Get all existing players
      const existingPlayers = await storage.getPlayers();
      console.log(`Found ${existingPlayers.length} existing players`);
      
      if (existingPlayers.length === 0) {
        return res.json({ message: "No existing players to process" });
      }
      
      // Convert to mutable objects and try to process with empty league data
      const mutablePlayers = existingPlayers.map(p => ({
        ...p,
        achievements: [...p.achievements], // Make achievements array mutable
        careerWinShares: p.careerWinShares ?? 0, // Ensure non-null
        quality: p.quality ?? 50, // Ensure non-null
        stats: p.stats ?? undefined // Fix null stats
      }));
      
      // Try to process league-level achievements (will mostly be empty due to no league data)
      await processLeagueLevelAchievements({}, mutablePlayers);
      
      // Update storage with any changes
      console.log("Updating players with league-level achievements...");
      await storage.clearPlayers();
      for (const player of mutablePlayers) {
        await storage.createPlayer(player);
      }
      
      res.json({ 
        message: "League-level achievement processing complete",
        playersProcessed: mutablePlayers.length 
      });
      
    } catch (error: any) {
      console.error("Debug processing error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Upload league file from URL
  app.post("/api/upload-url", async (req, res) => {
    console.log("🚀 URL UPLOAD STARTED (/api/upload-url)");
    console.log("URL:", req.body?.url);
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }
      
      console.log("Downloading file from URL:", url);
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ message: `Failed to download file: ${response.statusText}` });
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = url.split('/').pop() || 'league-file';
      
      // Process the downloaded file using the same logic as file upload
      await processLeagueFile(buffer, filename, res);
    } catch (error: any) {
      console.error("URL upload error:", error);
      res.status(500).json({ message: error.message || "Failed to process URL" });
    }
  });

  // Upload league file and parse players
  app.post("/api/upload", upload.single("file"), async (req: MulterRequest, res) => {
    console.log("🚀 FILE UPLOAD STARTED (/api/upload)");
    console.log("File received:", !!req.file);
    console.log("File name:", req.file?.originalname);
    console.log("File size:", req.file?.size);
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      await processLeagueFile(req.file.buffer, req.file.originalname || 'league-file', res);
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ message: error.message || "Upload failed" });
    }
  });

  // Comprehensive league-level achievement processing
  async function processLeagueLevelAchievements(leagueData: any, players: any[]) {
    console.log("🔍 Processing league-level achievements...");
    console.log("League data keys:", Object.keys(leagueData || {}));
    console.log("Players with PIDs:", players.filter(p => p.pid !== undefined).length);
    
    // Add more detailed debugging
    if (!leagueData) {
      console.log("❌ CRITICAL ERROR: leagueData is null/undefined");
      return;
    }
    
    if (players.length === 0) {
      console.log("❌ CRITICAL ERROR: No players provided");
      return;
    }
    
    // Build player lookup by pid
    const playerByPid = new Map<number, any>();
    players.forEach(player => {
      if (player.pid !== undefined) {
        playerByPid.set(player.pid, player);
      }
    });
    
    // Process Hall of Fame from events[]
    const hofPids = new Set<number>();
    if (leagueData.events && Array.isArray(leagueData.events)) {
      console.log(`📋 Found ${leagueData.events.length} events`);
      leagueData.events.forEach((event: any) => {
        if (event.type === "hallOfFame" && event.pids && Array.isArray(event.pids)) {
          event.pids.forEach((pid: number) => hofPids.add(pid));
        }
      });
      console.log(`🏆 Found ${hofPids.size} Hall of Fame players`);
    } else {
      console.log("❌ No events[] data found for Hall of Fame processing");
    }
    
    // Process champions from playoffSeries[]
    const championsByYear = new Map<number, number>(); // season -> winning team tid
    if (leagueData.playoffSeries && Array.isArray(leagueData.playoffSeries)) {
      leagueData.playoffSeries.forEach((yearData: any) => {
        if (yearData.series && Array.isArray(yearData.series) && yearData.series.length > 0) {
          // Find the final series (usually the last one)
          const finalSeries = yearData.series[yearData.series.length - 1];
          if (finalSeries && finalSeries.won === 4) {
            // Determine which team won (home or away)
            const championTid = finalSeries.home?.won === 4 ? finalSeries.home.tid : finalSeries.away?.tid;
            if (championTid !== undefined && yearData.season !== undefined) {
              championsByYear.set(yearData.season, championTid);
            }
          }
        }
      });
    }
    
    // Process All-Stars from allStars[]
    const allStarsByYear = new Map<number, Set<number>>();
    if (leagueData.allStars && Array.isArray(leagueData.allStars)) {
      leagueData.allStars.forEach((yearData: any) => {
        if (yearData.teams && Array.isArray(yearData.teams) && yearData.season !== undefined) {
          const allStarsThisYear = new Set<number>();
          yearData.teams.forEach((team: any) => {
            if (Array.isArray(team)) {
              team.forEach((pid: number) => allStarsThisYear.add(pid));
            }
          });
          allStarsByYear.set(yearData.season, allStarsThisYear);
        }
      });
    }
    
    // Process awards from awards[]
    const awardsByType = new Map<string, Set<number>>();
    if (leagueData.awards && Array.isArray(leagueData.awards)) {
      console.log(`🏅 Found ${leagueData.awards.length} seasons of awards data`);
      leagueData.awards.forEach((yearData: any) => {
        // Process individual awards
        ['mvp', 'dpoy', 'roy', 'smoy', 'mip', 'finalsMvp'].forEach(awardType => {
          if (yearData[awardType] && yearData[awardType].pid !== undefined) {
            if (!awardsByType.has(awardType)) awardsByType.set(awardType, new Set());
            awardsByType.get(awardType)!.add(yearData[awardType].pid);
          }
        });
        
        // Process team awards (All-League, All-Defensive)
        ['allLeague', 'allDefensive'].forEach(teamAwardType => {
          if (yearData[teamAwardType] && Array.isArray(yearData[teamAwardType])) {
            if (!awardsByType.has(teamAwardType)) awardsByType.set(teamAwardType, new Set());
            yearData[teamAwardType].forEach((team: any) => {
              if (team.players && Array.isArray(team.players)) {
                team.players.forEach((player: any) => {
                  if (player.pid !== undefined) {
                    awardsByType.get(teamAwardType)!.add(player.pid);
                  }
                });
              }
            });
          }
        });
      });
      console.log("Awards processed:", Array.from(awardsByType.entries()).map(([type, pids]) => `${type}: ${pids.size} players`));
    } else {
      console.log("❌ No awards[] data found");
    }
    
    // Process game feats from playerFeats[]
    const featsByType = new Map<string, Set<number>>();
    if (leagueData.playerFeats && Array.isArray(leagueData.playerFeats)) {
      console.log(`🎯 Found ${leagueData.playerFeats.length} player feats`);
      leagueData.playerFeats.forEach((feat: any) => {
        if (feat.pid !== undefined && feat.stats) {
          const stats = feat.stats;
          
          // 50+ points
          if ((stats.pts || 0) >= 50) {
            if (!featsByType.has('50pts')) featsByType.set('50pts', new Set());
            featsByType.get('50pts')!.add(feat.pid);
          }
          
          // Triple-double
          if (stats.td > 0) {
            if (!featsByType.has('td')) featsByType.set('td', new Set());
            featsByType.get('td')!.add(feat.pid);
          }
          
          // 20+ rebounds
          if (((stats.orb || 0) + (stats.drb || 0)) >= 20) {
            if (!featsByType.has('20reb')) featsByType.set('20reb', new Set());
            featsByType.get('20reb')!.add(feat.pid);
          }
          
          // 20+ assists
          if ((stats.ast || 0) >= 20) {
            if (!featsByType.has('20ast')) featsByType.set('20ast', new Set());
            featsByType.get('20ast')!.add(feat.pid);
          }
          
          // 10+ threes
          if ((stats.tp || 0) >= 10) {
            if (!featsByType.has('10threes')) featsByType.set('10threes', new Set());
            featsByType.get('10threes')!.add(feat.pid);
          }
        }
      });
    }
    
    // Build league leadership indices per season
    const leadershipByYearType = new Map<string, Map<number, Set<number>>>();
    
    // For each season, compute league leaders among qualified players
    const seasonStats = new Map<number, any[]>();
    players.forEach(player => {
      if (player.stats && Array.isArray(player.stats)) {
        player.stats.filter((s: any) => !s.playoffs).forEach((season: any) => {
          if (!seasonStats.has(season.season)) seasonStats.set(season.season, []);
          seasonStats.get(season.season)!.push({...season, pid: player.pid});
        });
      }
    });
    
    seasonStats.forEach((stats, season) => {
      const G = 82; // Default season length
      const minGames = Math.ceil(0.58 * G);
      const qualifiedStats = stats.filter(s => (s.gp || 0) >= minGames);
      
      if (qualifiedStats.length === 0) return;
      
      // Calculate per-game rates and find leaders
      const rateStats = qualifiedStats.map(s => ({
        pid: s.pid,
        ppg: (s.pts || 0) / (s.gp || 1),
        rpg: ((s.orb || 0) + (s.drb || 0)) / (s.gp || 1),
        apg: (s.ast || 0) / (s.gp || 1),
        spg: (s.stl || 0) / (s.gp || 1),
        bpg: (s.blk || 0) / (s.gp || 1)
      }));
      
      // Find leaders for each category (ties count)
      const categories = ['ppg', 'rpg', 'apg', 'spg', 'bpg'];
      categories.forEach(cat => {
        const maxValue = Math.max(...rateStats.map(s => s[cat as keyof typeof s] as number));
        const leaders = rateStats.filter(s => Math.abs((s[cat as keyof typeof s] as number) - maxValue) < 1e-9);
        
        const categoryKey = `led${cat.toUpperCase()}`;
        if (!leadershipByYearType.has(categoryKey)) {
          leadershipByYearType.set(categoryKey, new Map());
        }
        if (!leadershipByYearType.get(categoryKey)!.has(season)) {
          leadershipByYearType.get(categoryKey)!.set(season, new Set());
        }
        
        leaders.forEach(leader => {
          leadershipByYearType.get(categoryKey)!.get(season)!.add(leader.pid);
        });
      });
    });
    
    // Apply achievements to players based on processed data
    players.forEach(player => {
      if (player.pid === undefined) return;
      
      // Hall of Fame
      if (hofPids.has(player.pid)) {
        if (!player.achievements.includes("Hall of Fame")) {
          player.achievements.push("Hall of Fame");
        }
      }
      
      // Champions
      if (player.stats && Array.isArray(player.stats)) {
        for (const stat of player.stats) {
          if ((stat.gp || 0) > 0 && stat.season !== undefined && stat.tid !== undefined) {
            const championTid = championsByYear.get(stat.season);
            if (championTid === stat.tid) {
              if (!player.achievements.includes("NBA Champion")) {
                player.achievements.push("NBA Champion");
              }
              if (!player.achievements.includes("Champion")) {
                player.achievements.push("Champion");
              }
              break;
            }
          }
        }
      }
      
      // All-Star selections
      let hasAllStar = false;
      let hasAllStar35Plus = false;
      for (const [season, allStars] of Array.from(allStarsByYear.entries())) {
        if (allStars.has(player.pid)) {
          if (!hasAllStar) {
            player.achievements.push("All-Star Selection");
            hasAllStar = true;
          }
          
          // Check age for All-Star at 35+
          if (player.born && player.born.year) {
            const age = season - player.born.year;
            if (age >= 35 && !hasAllStar35Plus) {
              player.achievements.push("Made All-Star Team at Age 35+");
              hasAllStar35Plus = true;
            }
          }
        }
      }
      
      // Awards
      const awardMappings = {
        'mvp': 'MVP Winner',
        'dpoy': 'Defensive Player of the Year',
        'roy': 'Rookie of the Year',
        'smoy': 'Sixth Man of the Year',
        'mip': 'Most Improved Player',
        'finalsMvp': 'Finals MVP',
        'allLeague': 'All-League Team',
        'allDefensive': 'All-Defensive Team'
      };
      
      Object.entries(awardMappings).forEach(([awardType, achievementName]) => {
        if (awardsByType.has(awardType) && awardsByType.get(awardType)!.has(player.pid)) {
          if (!player.achievements.includes(achievementName)) {
            player.achievements.push(achievementName);
          }
        }
      });
      
      // Game feats
      const featMappings = {
        '50pts': 'Scored 50+ in a Game',
        'td': 'Triple-Double in a Game',
        '20reb': '20+ Rebounds in a Game',
        '20ast': '20+ Assists in a Game',
        '10threes': '10+ Threes in a Game'
      };
      
      Object.entries(featMappings).forEach(([featType, achievementName]) => {
        if (featsByType.has(featType) && featsByType.get(featType)!.has(player.pid)) {
          if (!player.achievements.includes(achievementName)) {
            player.achievements.push(achievementName);
          }
        }
      });
      
      // League leadership
      const leadershipMappings = {
        'ledPPG': 'Led League in Scoring',
        'ledRPG': 'Led League in Rebounds', 
        'ledAPG': 'Led League in Assists',
        'ledSPG': 'Led League in Steals',
        'ledBPG': 'Led League in Blocks'
      };
      
      Object.entries(leadershipMappings).forEach(([leaderType, achievementName]) => {
        if (leadershipByYearType.has(leaderType)) {
          for (const [season, leaders] of Array.from(leadershipByYearType.get(leaderType)!.entries())) {
            if (leaders.has(player.pid)) {
              if (!player.achievements.includes(achievementName)) {
                player.achievements.push(achievementName);
              }
              break;
            }
          }
        }
      });
    });
    
    // Process "Teammate of All-Time Greats" (HOF players as greats)
    const allTimeGreatPids = hofPids;
    players.forEach(player => {
      if (allTimeGreatPids.has(player.pid)) return; // Skip if they are themselves a great
      
      for (const greatPid of Array.from(allTimeGreatPids)) {
        const great = playerByPid.get(greatPid);
        if (!great || !great.stats || !player.stats) continue;
        
        // Check for shared seasons and teams
        for (const playerStat of player.stats) {
          if ((playerStat.gp || 0) <= 0) continue;
          
          for (const greatStat of great.stats) {
            if ((greatStat.gp || 0) <= 0) continue;
            
            if (playerStat.season === greatStat.season && playerStat.tid === greatStat.tid) {
              if (!player.achievements.includes("Teammate of All-Time Greats")) {
                player.achievements.push("Teammate of All-Time Greats");
              }
              return; // Found one, no need to continue
            }
          }
        }
      }
    });
    
    // Add BBGM Easter egg with curated allow-list (protect against generic inference)
    const EASTER_EGG_PIDS = new Set<number>([
      // Curated list of special BBGM-related players (can be updated as needed)
      // These are intentionally rare and hand-picked
    ]);
    
    players.forEach((player: any) => {
      if (typeof player.pid === 'number' && (EASTER_EGG_PIDS.has(player.pid) || 
          (player.name && (player.name.includes("dumbmatter") || player.name.includes("BBGM"))))) {
        if (!player.achievements.includes("BBGM Player")) {
          player.achievements.push("BBGM Player");
        }
      }
    });
    
    console.log("League-level achievement processing complete.");
  }

  // Helper function to process league files
  async function processLeagueFile(fileBuffer: Buffer, filename: string, res: any) {
    console.log("📂 PROCESSING LEAGUE FILE:", filename);
    console.log("Buffer size:", fileBuffer.length);
    try {
      let fileContent: string;
      
      // Check if file is gzipped by magic bytes or filename
      const isGzipped = filename.endsWith(".gz") || filename.endsWith(".gzip") || 
                       (fileBuffer.length >= 2 && fileBuffer[0] === 0x1f && fileBuffer[1] === 0x8b);
      
      if (isGzipped) {
        try {
          fileBuffer = await gunzipAsync(fileBuffer);
          console.log("Successfully decompressed gzip file");
        } catch (error) {
          console.error("Gzip decompression error:", error);
          return res.status(400).json({ message: "Failed to decompress gzip file" });
        }
      }
      
      fileContent = fileBuffer.toString();
      let players: any[] = [];

      const isJson = filename.includes(".json") || (isGzipped && filename.includes(".json"));

      if (isJson) {
        const data = JSON.parse(fileContent);
        let rawPlayers = [];
        
        console.log("File structure keys:", Object.keys(data));
        
        // Handle BBGM format
        if (data.players && Array.isArray(data.players)) {
          rawPlayers = data.players;
          console.log(`Found ${rawPlayers.length} players in BBGM format`);
        } else if (Array.isArray(data)) {
          rawPlayers = data;
          console.log(`Found ${rawPlayers.length} players in array format`);
        } else {
          console.log("Invalid JSON structure. Expected players array but got:", typeof data);
          return res.status(400).json({ message: "Invalid JSON format. Expected players array." });
        }
        
        // Create team mapping from BBGM teams data
        const teamMap = new Map<number, {name: string, abbrev: string, logo?: string}>();
        if (data.teams && Array.isArray(data.teams)) {
          console.log(`Found ${data.teams.length} teams in BBGM file`);
          data.teams.forEach((team: any, index: number) => {
            if (team && team.region && team.name) {
              const teamInfo = {
                name: `${team.region} ${team.name}`,
                abbrev: team.abbrev || team.tid || team.region?.substring(0, 3).toUpperCase() || 'UNK',
                logo: team.imgURL || team.imgUrl || team.logo
              };
              teamMap.set(index, teamInfo);
            }
          });
          console.log("Team mapping with abbreviations created:", Array.from(teamMap.entries()).slice(0, 5));
        } else {
          console.log("No teams array found in BBGM file");
        }
        
        // Transform BBGM player data to our format
        players = rawPlayers.map((player: any) => {
          const name = player.firstName && player.lastName 
            ? `${player.firstName} ${player.lastName}` 
            : player.name || "Unknown Player";
          
          // Map team ID to team name using BBGM teams data
          const teams: string[] = [];
          if (player.tid !== undefined && player.tid >= 0) {
            const teamInfo = teamMap.get(player.tid);
            const teamName = teamInfo?.name || `Team ${player.tid}`;
            teams.push(teamName);
          }
          
          // Also collect teams from stats history - only include teams where player actually played games
          const allTeams = new Set(teams);
          if (player.stats && Array.isArray(player.stats)) {
            player.stats.forEach((stat: any) => {
              // Only include teams where the player actually played games
              if (stat.tid !== undefined && stat.tid >= 0 && (stat.gp || 0) > 0) {
                const teamInfo = teamMap.get(stat.tid);
                const teamName = teamInfo?.name || `Team ${stat.tid}`;
                allTeams.add(teamName);
              }
            });
          }
          
          // Process achievements and career stats for Immaculate Grid rules
          const achievements: string[] = [];
          
          // Helper function to calculate career totals (regular season only)
          function careerTotalsRegularSeason(p: any) {
            let pts=0, ast=0, stl=0, blk=0, tp=0, orb=0, drb=0;
            for (const s of p.stats ?? []) {
              if (s.playoffs) continue; // Regular season only
              pts += s.pts ?? 0;
              ast += s.ast ?? 0;
              stl += s.stl ?? 0;
              blk += s.blk ?? 0;
              tp  += s.tp  ?? 0;
              orb += s.orb ?? 0;
              drb += s.drb ?? 0;
            }
            const trb = orb + drb; // Fix: use orb + drb instead of non-existent trb
            return {pts, trb, ast, stl, blk, tp};
          }
          
          // Helper function to get season game minimum based on season length
          function seasonNumGames(season: number): number {
            // Default to 82 games - can be enhanced to use gameAttributes.numGames if available
            return 82;
          }
          
          function minGamesForSeason(season: number): number {
            const G = seasonNumGames(season);
            return Math.ceil(0.58 * G); // 58% threshold for rate-based achievements
          }
          
          const careerTotals = careerTotalsRegularSeason(player);
          
          // Career total achievements
          if (careerTotals.pts >= 20000) achievements.push("20,000+ Career Points");
          if (careerTotals.trb >= 10000) achievements.push("10,000+ Career Rebounds");
          if (careerTotals.ast >= 5000) achievements.push("5,000+ Career Assists");
          if (careerTotals.stl >= 2000) achievements.push("2,000+ Career Steals");
          if (careerTotals.blk >= 1500) achievements.push("1,500+ Career Blocks");
          if (careerTotals.tp >= 2000) achievements.push("2,000+ Made Threes");

          // Check for season-based statistical achievements (regular season only)
          if (player.stats && Array.isArray(player.stats)) {
            const regularSeasonStats = player.stats.filter((s: any) => !s.playoffs);
            
            for (const season of regularSeasonStats) {
              const gp = season.gp || 0;
              const minGames = minGamesForSeason(season.season);
              
              if (gp < minGames) continue; // Require minimum games for rate-based achievements
              
              // Calculate per-game averages properly
              const ppg = (season.pts || 0) / gp;
              const rpg = ((season.orb || 0) + (season.drb || 0)) / gp; // Fix: use orb + drb
              const apg = (season.ast || 0) / gp;
              const spg = (season.stl || 0) / gp;  
              const bpg = (season.blk || 0) / gp;
              
              // Single-season per-game achievements (avoid duplicates with Set logic)
              if (ppg >= 30 && !achievements.includes("Averaged 30+ PPG in a Season")) {
                achievements.push("Averaged 30+ PPG in a Season");
              }
              if (apg >= 10 && !achievements.includes("Averaged 10+ APG in a Season")) {
                achievements.push("Averaged 10+ APG in a Season");
              }
              if (rpg >= 15 && !achievements.includes("Averaged 15+ RPG in a Season")) {
                achievements.push("Averaged 15+ RPG in a Season");
              }
              if (bpg >= 3 && !achievements.includes("Averaged 3+ BPG in a Season")) {
                achievements.push("Averaged 3+ BPG in a Season");
              }
              if (spg >= 2.5 && !achievements.includes("Averaged 2.5+ SPG in a Season")) {
                achievements.push("Averaged 2.5+ SPG in a Season");
              }
              
              // 50/40/90 achievement with attempt minimums
              const MIN_FGA = 300, MIN_TPA = 82, MIN_FTA = 125;
              if (season.fga >= MIN_FGA && season.tpa >= MIN_TPA && season.fta >= MIN_FTA) {
                const fgPct = (season.fg || 0) / season.fga;
                const tpPct = (season.tp || 0) / season.tpa;
                const ftPct = (season.ft || 0) / season.fta;
                
                if (fgPct >= 0.5 && tpPct >= 0.4 && ftPct >= 0.9) {
                  if (!achievements.includes("Shot 50/40/90 in a Season")) {
                    achievements.push("Shot 50/40/90 in a Season");
                  }
                }
              }
            }
          }
          
          // Process draft achievements
          if (player.draft) {
            if (player.draft.round === 1 && player.draft.pick === 1) {
              achievements.push("#1 Overall Draft Pick");
            }
            if (player.draft.round === 1) {
              achievements.push("First Round Pick");
            }
            if (player.draft.round === 2) {
              achievements.push("2nd Round Pick");
            }
            if (player.draft.round === 0 || player.draft.pick === 0 || player.draft.tid < 0) {
              achievements.push("Undrafted Player");
            }
          }
          
          // Career length achievement
          if (player.stats && Array.isArray(player.stats)) {
            const distinctSeasons = new Set(
              player.stats
                .filter((s: any) => !s.playoffs && (s.gp || 0) > 0)
                .map((s: any) => s.season)
            );
            if (distinctSeasons.size >= 15) {
              achievements.push("Played 15+ Seasons");
            }
          }
          
          // Only One Team achievement
          if (player.stats && Array.isArray(player.stats)) {
            const distinctTeams = new Set(
              player.stats
                .filter((s: any) => (s.gp || 0) > 0)
                .map((s: any) => s.tid)
            );
            if (distinctTeams.size === 1) {
              achievements.push("Only One Team");
            }
          }
          
          // Note: Awards, feats, champions, Hall of Fame, etc. will be processed
          // from the league-level data structures (awards[], playerFeats[], events[], etc.)
          // This requires access to the full league data which will be implemented below

          // Note: Additional achievements like league leadership, awards, feats, champions,
          // All-Star at 35+, Hall of Fame, etc. will be processed from the league-level 
          // data after parsing all players
          
          // Extract career years and teams from statistics - track separate stints for each team
          const years: { team: string; start: number; end: number }[] = [];
          if (player.stats && Array.isArray(player.stats)) {
            // Sort stats by season to process chronologically
            const sortedStats = player.stats
              .filter((stat: any) => stat.season && stat.tid !== undefined && (stat.gp || 0) > 0)
              .sort((a: any, b: any) => a.season - b.season);
            
            let currentTeam: string | null = null;
            let currentStart: number | null = null;
            let currentEnd: number | null = null;
            
            sortedStats.forEach((stat: any) => {
              const teamInfo = teamMap.get(stat.tid);
              const teamName = teamInfo?.name || `Team ${stat.tid}`;
              
              if (teamName !== currentTeam) {
                // Save previous stint if it exists
                if (currentTeam && currentStart && currentEnd) {
                  years.push({ team: currentTeam, start: currentStart, end: currentEnd });
                }
                // Start new stint
                currentTeam = teamName;
                currentStart = stat.season;
                currentEnd = stat.season;
              } else {
                // Continue current stint
                currentEnd = stat.season;
              }
            });
            
            // Save final stint
            if (currentTeam && currentStart && currentEnd) {
              years.push({ team: currentTeam, start: currentStart, end: currentEnd });
            }
          }
          
          // Calculate career win shares from stats (if available)
          let careerWinShares = 0;
          if (player.stats && Array.isArray(player.stats)) {
            player.stats.forEach((stat: any) => {
              // BBGM uses 'ws' for win shares, but let's also check common variants
              if (stat.ws !== undefined) {
                careerWinShares += stat.ws || 0;
              } else if (stat.winShares !== undefined) {
                careerWinShares += stat.winShares || 0;
              } else if (stat.WS !== undefined) {
                careerWinShares += stat.WS || 0;
              }
            });
          }
          
          // If no win shares found, use overall rating as a proxy
          if (careerWinShares === 0 && player.ratings && Array.isArray(player.ratings)) {
            const avgRating = player.ratings.reduce((sum: number, rating: any) => sum + (rating.ovr || 0), 0) / player.ratings.length;
            careerWinShares = avgRating / 10; // Rough approximation
          }

          // Enhance face data with team ID and team info for color mapping
          let enhancedFace = player.face || null;
          if (enhancedFace && player.tid !== undefined && player.tid >= 0) {
            enhancedFace = {
              ...enhancedFace,
              tid: player.tid,
              currentTeam: teamMap.get(player.tid)?.name || `Team ${player.tid}`,
              teamAbbrev: teamMap.get(player.tid)?.abbrev || null
            };
          }

          return {
            name,
            teams: Array.from(allTeams),
            years,
            achievements,
            stats: player.ratings || player.stats || undefined,
            face: enhancedFace,
            imageUrl: player.imgURL || player.imageUrl || player.img || undefined,
            careerWinShares: Math.round(careerWinShares * 10), // Convert to integer (tenths)
            quality: 50 // Will be calculated later
          };
        }).filter((p: any) => p.name !== "Unknown Player"); // Only include players with valid names
        
        // Process league-level data for comprehensive achievements
        console.log("🚀 About to process league-level achievements...");
        console.log("isJson:", isJson, "data exists:", !!data);
        console.log("Players array length:", players.length);
        
        if (isJson && data) {
          console.log("✅ Calling processLeagueLevelAchievements...");
          await processLeagueLevelAchievements(data, players);
        } else {
          console.log("❌ Skipping league-level processing - isJson:", isJson, "data:", !!data);
          // TEMPORARY: Force call with existing data to test
          if (players.length > 0) {
            console.log("🔧 TEMP: Forcing league-level processing with available data...");
            await processLeagueLevelAchievements(data || {}, players);
          }
        }
      } else {
        return res.status(400).json({ message: "Unsupported file format. Please upload JSON or gzipped league files only." });
      }

      console.log(`Parsed ${players.length} players from file`);
      if (players.length > 0) {
        console.log("Sample player:", JSON.stringify(players[0], null, 2));
      }

      // Validate and create players with better error handling
      const validatedPlayers: any[] = [];
      const errors: string[] = [];
      
      for (let i = 0; i < players.length; i++) { // Process all players
        try {
          // Apply defaults before validation
          const playerWithDefaults = {
            name: players[i].name || "Unknown Player",
            teams: players[i].teams || [],
            years: players[i].years || [],
            achievements: players[i].achievements || [],
            stats: players[i].stats,
            face: players[i].face,
            imageUrl: players[i].imageUrl || undefined,
            careerWinShares: players[i].careerWinShares || 0
          };
          
          const validatedPlayer = insertPlayerSchema.parse(playerWithDefaults);
          validatedPlayers.push(validatedPlayer);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Validation failed';
          if (errors.length < 10) { // Only store first 10 errors to save memory
            errors.push(`Player ${i + 1} (${players[i]?.name || 'unnamed'}): ${errorMsg}`);
          }
          if (i < 3) { // Only log first 3 errors to avoid spam
            console.log(`Validation error for player ${i + 1}:`, errorMsg);
          }
          // Skip invalid players but continue processing
          continue;
        }
      }
      
      console.log(`Successfully validated ${validatedPlayers.length} out of ${players.length} players`);
      if (errors.length > 0) {
        console.log(`First few errors:`, errors.slice(0, 3));
      }
      
      if (validatedPlayers.length === 0) {
        return res.status(400).json({ 
          message: "No valid players found in file", 
          errors: errors.slice(0, 10), // Show first 10 errors
          totalPlayers: players.length
        });
      }

      // Calculate career quality scores for all players
      deriveCareerAggregates(validatedPlayers);
      assignQuality(validatedPlayers);
      
      // Clear existing players and add new ones
      await storage.clearPlayers();
      const createdPlayers = await storage.createPlayers(validatedPlayers);

      // Extract teams and achievements for frontend
      const teamNames = Array.from(new Set(createdPlayers.flatMap(p => p.teams)));
      const achievements = Array.from(new Set(createdPlayers.flatMap(p => p.achievements)));
      
      // Define teamMap in the correct scope if it doesn't exist
      let finalTeamMap = new Map<number, {name: string, abbrev: string, logo?: string}>();
      if (isJson) {
        const data = JSON.parse(fileContent);
        if (data.teams && Array.isArray(data.teams)) {
          data.teams.forEach((team: any, index: number) => {
            if (team && team.region && team.name) {
              const teamInfo = {
                name: `${team.region} ${team.name}`,
                abbrev: team.abbrev || team.tid || team.region?.substring(0, 3).toUpperCase() || 'UNK',
                logo: team.imgURL || team.imgUrl || team.logo
              };
              finalTeamMap.set(index, teamInfo);
            }
          });
        }
      }
      
      const teams = teamNames.map(name => {
        // Find the team info from our mapping
        const teamInfo = Array.from(finalTeamMap.values()).find(t => t.name === name);
        return {
          name,
          abbrev: teamInfo?.abbrev || name.substring(0, 3).toUpperCase(),
          logo: teamInfo?.logo
        };
      });

      const result: FileUploadData = {
        players: createdPlayers.map(p => ({
          name: p.name,
          teams: p.teams,
          years: p.years,
          achievements: p.achievements,
          stats: p.stats || undefined,
          careerWinShares: p.careerWinShares || 0,
          quality: p.quality || 50
        })),
        teams,
        achievements
      };

      res.json(result);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid file format" });
    }
  }

  // Generate a new game grid
  app.post("/api/games/generate", async (req, res) => {
    try {
      console.log("🔧 TESTING: Running league-level processing during grid generation...");
      
      const players = await storage.getPlayers();
      
      // TEMPORARY: Force league-level processing on existing players to test
      if (players.length > 0) {
        console.log("🔧 TEMP: Processing league achievements on existing players...");
        const mutablePlayers = players.map(p => ({
          ...p,
          achievements: [...p.achievements],
          careerWinShares: p.careerWinShares ?? 0, // Ensure non-null
          quality: p.quality ?? 50, // Ensure non-null
          stats: p.stats ?? undefined // Fix null stats
        }));
        
        await processLeagueLevelAchievements({}, mutablePlayers);
        
        // Update storage if achievements were added
        let hadChanges = false;
        for (let i = 0; i < mutablePlayers.length; i++) {
          if (mutablePlayers[i].achievements.length !== players[i].achievements.length) {
            hadChanges = true;
            break;
          }
        }
        
        if (hadChanges) {
          console.log("🔧 Detected changes, updating storage...");
          await storage.clearPlayers();
          for (const player of mutablePlayers) {
            await storage.createPlayer(player);
          }
          console.log("🔧 Storage updated with league-level achievements");
        }
      }
      
      if (players.length === 0) {
        return res.status(400).json({ 
          message: "No players data available. Please upload a league file first." 
        });
      }

      // Get unique teams from player data
      const allTeams = Array.from(new Set(players.flatMap(p => p.teams)));
      console.log("🔧 All teams in database:", allTeams.length, "total teams");
      console.log("🔧 Sample teams:", allTeams.slice(0, 10));
      
      // Use all teams that have sufficient players (supports custom leagues)
      // This ensures teams like St. Louis Spirits and Columbus Crush appear
      const teams = allTeams.filter(team => {
        const teamPlayerCount = players.filter(p => p.teams.includes(team)).length;
        return teamPlayerCount >= 10; // Minimum players for a team to appear in grids
      });
      
      console.log("🔧 Eligible teams for grids:", teams.length, "teams");
      console.log("🔧 Checking for St. Louis Spirits:", teams.includes("St. Louis Spirits"));
      console.log("🔧 Checking for Columbus Crush:", teams.includes("Columbus Crush"));
      const allAchievements = Array.from(new Set(players.flatMap(p => p.achievements)));
      
      // Complete list of 34 achievements for uniform sampling (as specified in brief)
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
        
        // Note: BBGM Player easter egg excluded from grid generation for uniform sampling
      ];

      // Add dynamic "Teammate of All-Time Greats" criteria based on career Win Shares
      const allTimeGreats = players
        .filter(p => p.careerWinShares && p.careerWinShares >= 150) // Very high threshold for all-time greats
        .sort((a, b) => (b.careerWinShares || 0) - (a.careerWinShares || 0))
        .slice(0, 20); // Top 20 by Win Shares
      
      // For each player, check if they were teammates with any all-time greats
      players.forEach(player => {
        for (const great of allTimeGreats) {
          if (player.name !== great.name) {
            // Check if they shared any teams
            const sharedTeams = player.teams.filter(team => great.teams.includes(team));
            if (sharedTeams.length > 0) {
              // Verify they actually played together (overlapping years)
              const playerYears = player.years || [];
              const greatYears = great.years || [];
              
              for (const team of sharedTeams) {
                const playerTeamYears = playerYears.find(y => y.team === team);
                const greatTeamYears = greatYears.find(y => y.team === team);
                
                if (playerTeamYears && greatTeamYears) {
                  // Check for year overlap
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
      
      // Debug: Log all achievements found in players
      console.log("All unique achievements in player data:", Array.from(allAchievements).sort());
      
      // Debug: Check each achievement in our master list
      const availableAchievements = ACHIEVEMENTS.filter(ach => {
        const playersWithAchievement = players.filter(p => p.achievements.includes(ach)).length;
        const isAvailable = allAchievements.includes(ach) && playersWithAchievement >= 2;
        
        if (!allAchievements.includes(ach)) {
          console.log(`❌ Achievement "${ach}" not found in any player data`);
        } else if (playersWithAchievement < 2) {
          console.log(`⚠️  Achievement "${ach}" found but only ${playersWithAchievement} players have it (need ≥2)`);
        } else {
          console.log(`✅ Achievement "${ach}" available with ${playersWithAchievement} players`);
        }
        
        return isAvailable;
      });
      
      console.log(`Available achievements for grid generation: ${availableAchievements.length}/${ACHIEVEMENTS.length}`);
      console.log("Available achievements:", availableAchievements);
      
      // Uniform sampling - shuffle array to ensure equal probability for all achievements
      const achievements = [...availableAchievements].sort(() => Math.random() - 0.5);

      if (teams.length < 3) {
        return res.status(400).json({ 
          message: "Not enough data to generate a grid. Need at least 3 teams." 
        });
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
        
        // Log successful grid generation
        if (attempt === 0) {
          console.log("Generated grid with criteria:");
          console.log("Columns:", columnCriteria.map(c => `${c.label} (${c.type})`));
          console.log("Rows:", rowCriteria.map(r => `${r.label} (${r.type})`));
        }

        if (gridIsValid(correctAnswers)) {
          const gameData = insertGameSchema.parse({
            columnCriteria,
            rowCriteria,
            correctAnswers,
          });

          const newGame = await storage.createGame(gameData);
          return res.json(newGame);
        }
      }

      // If no valid grid after 200 tries, try a simpler approach
      console.log(`Failed to generate grid after 200 attempts. Teams: ${teams.length}, Achievements: ${achievements.length}`);
      
      // Fallback: Simple team-only grid if we have enough teams
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
          const gameData = insertGameSchema.parse({
            columnCriteria,
            rowCriteria,
            correctAnswers,
          });

          const newGame = await storage.createGame(gameData);
          return res.json(newGame);
        }
      }
      
      res.status(400).json({ 
        message: `Couldn't generate a valid grid. Available teams: ${teams.length}, available achievements: ${achievements.length}. Dataset may need more variety.` 
      });

    } catch (error: any) {
      console.error("Generate game error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to generate game" 
      });
    }
  });

  // Get a specific game by ID
  app.get("/api/games/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const game = await storage.getGame(id);
      
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      
      res.json(game);
    } catch (error) {
      console.error("Get game error:", error);
      res.status(500).json({ message: "Failed to retrieve game" });
    }
  });

  // Search players
  app.get("/api/players/search", async (req, res) => {
    try {
      const { q } = searchQuerySchema.parse(req.query);
      const players = await storage.searchPlayers(q);
      res.json(players);
    } catch (error) {
      res.status(400).json({ message: "Invalid search query" });
    }
  });

  // Get top players for a cell (for "Other Top Answers" section)
  app.get("/api/players/top-for-cell", async (req, res) => {
    try {
      const { columnCriteria, rowCriteria, excludePlayer, includeGuessed } = req.query;
      const players = await storage.getPlayers();
      
      if (!columnCriteria || !rowCriteria) {
        return res.status(400).json({ message: "Column and row criteria required" });
      }

      // Parse criteria from query strings
      const colCriteria = JSON.parse(columnCriteria as string);
      const rowCriteria_item = JSON.parse(rowCriteria as string);
      
      // Use new eligibility system
      const eligibilityChecker = new EligibilityChecker(players);
      const eligiblePlayers = eligibilityChecker.getEligiblePlayers(colCriteria, rowCriteria_item);
      
      // Sort by Win Shares 
      const sortedPlayers = eligibilityChecker.sortByWinShares(eligiblePlayers);
      
      let topPlayers;
      if (includeGuessed === 'true') {
        // Include guessed player if they're in top 10
        topPlayers = sortedPlayers
          .slice(0, 10)
          .map(p => ({ name: p.name, teams: p.teams }));
      } else {
        // Exclude the current player (legacy behavior)
        topPlayers = sortedPlayers
          .filter(p => p.name !== excludePlayer)
          .slice(0, 10)
          .map(p => ({ name: p.name, teams: p.teams }));
      }
      
      res.json(topPlayers);
    } catch (error) {
      console.error("Get top players error:", error);
      res.status(500).json({ message: "Failed to get top players" });
    }
  });

  // Debug endpoint to check player matches for specific criteria
  
app.get("/api/debug/matches", async (req, res) => {
    try {
      const { team, team2, achievement } = req.query;
      
      const players = await storage.getPlayers();
      let matches;
      
      // Use new eligibility system
      const eligibilityChecker = new EligibilityChecker(players);
      
      if (team && team2) {
        // Team-to-team criteria
        const colCriteria = { type: "team", value: team as string };
        const rowCriteria = { type: "team", value: team2 as string };
        matches = eligibilityChecker.getEligiblePlayers(colCriteria, rowCriteria);
      } else if (team && achievement) {
        // Team-to-achievement criteria
        const colCriteria = { type: "team", value: team as string };
        const rowCriteria = { type: "achievement", value: achievement as string };
        matches = eligibilityChecker.getEligiblePlayers(colCriteria, rowCriteria);
      } else {
        return res.status(400).json({ message: "Need either team+achievement or team+team2 parameters" });
      }
      
      // Sort by Win Shares using new system
      matches = eligibilityChecker.sortByWinShares(matches);
      
      res.json({ players: matches });
    } catch (error) {
      res.status(500).json({ message: "Debug query failed" });
    }
  });

  // Get session statistics (must come before /:id route)
  app.get("/api/sessions/stats", async (req, res) => {
    try {
      const sessions = await storage.getGameSessions();
      const completedSessions = sessions.filter(s => s.completed);
      
      const stats = {
        gridsCompleted: completedSessions.length,
        averageScore: completedSessions.length > 0 
          ? Math.round((completedSessions.reduce((sum, s) => sum + s.score, 0) / completedSessions.length) * 10) / 10
          : 0,
        bestScore: completedSessions.length > 0 
          ? Math.max(...completedSessions.map(s => s.score))
          : 0,
        successRate: completedSessions.length > 0
          ? Math.round((completedSessions.reduce((sum, s) => sum + s.score, 0) / (completedSessions.length * 9)) * 100)
          : 0
      };

      res.json(stats);
    } catch (error) {
      console.error("Get session stats error:", error);
      res.status(500).json({ message: "Failed to retrieve session stats" });
    }
  });

  // Get a specific session by ID
  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const session = await storage.getGameSession(id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      res.json(session);
    } catch (error) {
      console.error("Get session error:", error);
      res.status(500).json({ message: "Failed to retrieve session" });
    }
  });

  // Create a new game session
  app.post("/api/sessions", async (req, res) => {
    try {
      const sessionData = insertGameSessionSchema.parse(req.body);
      const session = await storage.createGameSession(sessionData);
      res.json(session);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid session data" });
    }
  });

  // Submit an answer
  app.post("/api/sessions/:id/answer", async (req, res) => {
    try {
      const { id } = req.params;
      const { row, col, player } = answerSchema.parse(req.body);
      
      const session = await storage.getGameSession(id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const game = await storage.getGame(session.gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      const cellKey = `${row}_${col}`;
      const correctPlayers = game.correctAnswers[cellKey] || [];
      const isCorrect = correctPlayers.some(p => p.toLowerCase() === player.toLowerCase());
      
      // Debug logging for answer validation
      console.log(`DEBUG: Answer validation for "${player}"`);
      console.log(`Cell (${row}_${col}) criteria: Column=${game.columnCriteria[col]?.label}, Row=${game.rowCriteria[row]?.label}`);
      console.log(`Expected players for this cell:`, correctPlayers.slice(0, 5)); // Show first 5
      console.log(`Player match found: ${isCorrect}`);
      


      // Calculate rarity using the same logic as "Other Top Answers"
      const players = await storage.getPlayers();
      const foundPlayer = players.find(p => p.name.toLowerCase() === player.toLowerCase());
      const playerQuality = foundPlayer?.quality || 50;
      
      let rarityPercent = 0;
      let playerRank = 0;
      let eligibleCount = 0;
      
      if (isCorrect) {
        // Use new eligibility system to get the same unsliced WS-sorted list as "Other Top Answers"
        const colCriteria = game.columnCriteria[col];
        const rowCriteria = game.rowCriteria[row];
        
        const eligibilityChecker = new EligibilityChecker(players);
        const eligiblePlayers = eligibilityChecker.getEligiblePlayers(colCriteria, rowCriteria);
        
        // Sort by Win Shares DESCENDING - this creates the fullList that "Other Top Answers" uses
        const fullList = eligibilityChecker.sortByWinShares(eligiblePlayers);
        
        const N = fullList.length;
        const idx = fullList.findIndex(p => p.name.toLowerCase() === player.toLowerCase());
        
        // Debug logging
        console.debug("fullList size", N);
        console.debug("picked idx", idx, "player", player);
        
        if (idx >= 0) {
          playerRank = idx + 1; // rank starts from 1
          eligibleCount = N;
          
          if (N === 1) {
            rarityPercent = 50;
          } else {
            // Fixed formula: rarity = round(100 * (rank - 1) / (eligibleCount - 1))
            // rank = 1 (highest WS, most common) → rarity = 0
            // rank = N (lowest WS, rarest) → rarity = 100
            rarityPercent = Math.round(100 * (playerRank - 1) / (eligibleCount - 1));
          }
          
          console.debug("rank", playerRank, "rarity", rarityPercent, "out of", eligibleCount);
        }
      }

      // Update session with the answer
      const updatedAnswers = {
        ...session.answers,
        [cellKey]: { player, correct: isCorrect, quality: playerQuality, rarity: rarityPercent, rank: playerRank, eligibleCount }
      };

      const newScore = session.score + (isCorrect ? 1 : 0);
      const totalAnswers = Object.keys(updatedAnswers).length;
      const isCompleted = totalAnswers === 9;

      const updatedSession = await storage.updateGameSession(id, {
        answers: updatedAnswers,
        score: newScore,
        completed: isCompleted
      });

      // Sort correct players by win shares (descending) when showing them
      let sortedCorrectPlayers = correctPlayers;
      if (!isCorrect && correctPlayers.length > 0) {
        // Get full player data for sorting
        const playerData = await Promise.all(
          correctPlayers.map(async (playerName: string) => {
            const players = await storage.searchPlayers(playerName);
            return players.find(p => p.name === playerName);
          })
        );
        
        // Sort by career win shares (descending) and extract names
        sortedCorrectPlayers = playerData
          .filter(Boolean) // Remove any null/undefined results
          .sort((a, b) => (b?.careerWinShares || 0) - (a?.careerWinShares || 0))
          .map(p => p!.name);
      }

      res.json({
        session: updatedSession,
        isCorrect,
        correctPlayers: isCorrect ? [] : sortedCorrectPlayers, // Show sorted correct players when wrong
        rarity: rarityPercent,
        rank: playerRank,
        eligibleCount: eligibleCount
      });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid answer data" });
    }
  });



  const httpServer = createServer(app);
  return httpServer;
}
