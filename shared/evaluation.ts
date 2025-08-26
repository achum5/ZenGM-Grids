// Evaluation logic for basketball grid game
export interface EvaluationResult {
  player: string;
  teamLabel: string;
  critLabel: string;
  teamPass: boolean;
  critPass: boolean;
  correct: boolean;
  parenthCrit?: string;
}

export interface DetailedEvaluation {
  correct: boolean;
  leftPass: boolean;
  rightPass: boolean;
  leftType: string;
  rightType: string;
  leftLabel: string;
  rightLabel: string;
}

export interface CellSpec {
  kind: "team" | "ach";
  teamId?: number;
  teamName?: string;
  achId?: string;
  achLabel?: string;
}

export interface EvalData {
  playerName: string;
  row: CellSpec;
  col: CellSpec;
  teamPass: boolean;
  critPass: boolean;
  parenthCrit?: string;
}

// Achievement phrase table per spec C3
const PHRASES: Record<string, {pos:()=>string; neg:()=>string}> = {
  // totals
  TOT_20000_PTS:{pos:()=> "had 20,000+ career points",  neg:()=> "did not have 20,000+ career points"},
  TOT_10000_REB:{pos:()=> "had 10,000+ career rebounds", neg:()=> "did not have 10,000+ career rebounds"},
  TOT_5000_AST:{pos:()=> "had 5,000+ career assists",    neg:()=> "did not have 5,000+ career assists"},
  TOT_2000_STL:{pos:()=> "had 2,000+ career steals",     neg:()=> "did not have 2,000+ career steals"},
  TOT_1500_BLK:{pos:()=> "had 1,500+ career blocks",     neg:()=> "did not have 1,500+ career blocks"},
  TOT_2000_3PM:{pos:()=> "made 2,000+ career threes",    neg:()=> "did not make 2,000+ career threes"},
  // season averages
  AVG_30_PPG:  {pos:()=> "averaged 30+ PPG in a season",  neg:()=> "did not average 30+ PPG in a season"},
  AVG_10_APG:  {pos:()=> "averaged 10+ APG in a season",  neg:()=> "did not average 10+ APG in a season"},
  AVG_15_RPG:  {pos:()=> "averaged 15+ RPG in a season",  neg:()=> "did not average 15+ RPG in a season"},
  AVG_3_BPG:   {pos:()=> "averaged 3+ BPG in a season",   neg:()=> "did not average 3+ BPG in a season"},
  AVG_2p5_SPG: {pos:()=> "averaged 2.5+ SPG in a season", neg:()=> "did not average 2.5+ SPG in a season"},
  SEAS_504090: {pos:()=> "recorded a 50/40/90 season",    neg:()=> "did not record a 50/40/90 season"},
  // leaders
  LED_PTS:     {pos:()=> "led the league in scoring",     neg:()=> "did not lead the league in scoring"},
  LED_REB:     {pos:()=> "led the league in rebounds",    neg:()=> "did not lead the league in rebounds"},
  LED_AST:     {pos:()=> "led the league in assists",     neg:()=> "did not lead the league in assists"},
  LED_STL:     {pos:()=> "led the league in steals",      neg:()=> "did not lead the league in steals"},
  LED_BLK:     {pos:()=> "led the league in blocks",      neg:()=> "did not lead the league in blocks"},
  // feats
  FEAT_50PTS:  {pos:()=> "scored 50+ points in a game",   neg:()=> "did not score 50+ points in a game"},
  FEAT_20REB:  {pos:()=> "grabbed 20+ rebounds in a game",neg:()=> "did not grab 20+ rebounds in a game"},
  FEAT_20AST:  {pos:()=> "dished 20+ assists in a game",  neg:()=> "did not dish 20+ assists in a game"},
  FEAT_10_3PM: {pos:()=> "made 10+ threes in a game",     neg:()=> "did not make 10+ threes in a game"},
  FEAT_TRIPLE: {pos:()=> "recorded a triple-double",      neg:()=> "did not record a triple-double"},
  // awards/selections/champs
  AWD_MVP:     {pos:()=> "won MVP",                        neg:()=> "did not win MVP"},
  AWD_DPOY:    {pos:()=> "won Defensive Player of the Year", neg:()=> "did not win Defensive Player of the Year"},
  AWD_ROY:     {pos:()=> "won Rookie of the Year",         neg:()=> "did not win Rookie of the Year"},
  AWD_6MOY:    {pos:()=> "won Sixth Man of the Year",      neg:()=> "did not win Sixth Man of the Year"},
  AWD_MIP:     {pos:()=> "won Most Improved Player",       neg:()=> "did not win Most Improved Player"},
  AWD_FMVP:    {pos:()=> "won Finals MVP",                 neg:()=> "did not win Finals MVP"},
  SEL_ALLNBA:  {pos:()=> "made an All-League team",        neg:()=> "did not make an All-League team"},
  SEL_ALLDEF:  {pos:()=> "made an All-Defensive team",     neg:()=> "did not make an All-Defensive team"},
  SEL_ALLSTAR: {pos:()=> "was an All-Star",                neg:()=> "was not an All-Star"},
  SEL_ALLSTAR_35:{pos:()=> "made an All-Star team at age 35+", neg:()=> "did not make an All-Star team at age 35+"},
  CHAMPION:    {pos:()=> "won an NBA championship",        neg:()=> "did not win an NBA championship"},
  HOF:         {pos:()=> "made the Hall of Fame",          neg:()=> "did not make the Hall of Fame"},
  // draft/meta
  DRAFT_1OA:   {pos:()=> "was a first overall pick",       neg:()=> "was not a first overall pick"},
  DRAFT_FIRST: {pos:()=> "was a first-round pick",         neg:()=> "was not a first-round pick"},
  DRAFT_SECOND:{pos:()=> "was a second-round pick",        neg:()=> "was not a second-round pick"},
  UNDRAFTED:   {pos:()=> "was undrafted",                  neg:()=> "was not undrafted"},
  CAREER_15Y:  {pos:()=> "played 15+ seasons",             neg:()=> "did not play 15+ seasons"},
  ONLY_ONE_TEAM:{pos:()=> "played only on one team",       neg:()=> "did not play only on one team"},
};

// Helper functions per spec C3
const teamPos = (name:string)=>`played for the ${name}`;
const teamNeg = (name:string)=>`did not play for the ${name}`;
const achPos  = (id:string)=>PHRASES[id]?.pos() ?? "met the criterion";
const achNeg  = (id:string)=>PHRASES[id]?.neg() ?? "did not meet the criterion";

// Map labels to IDs - maps actual achievement labels to phrase table keys
function mapLabelToId(label: string): string {
  // totals
  if (/20,?000\+?\s*(career\s+)?points/i.test(label)) return "TOT_20000_PTS";
  if (/10,?000\+?\s*(career\s+)?rebounds/i.test(label)) return "TOT_10000_REB";
  if (/5,?000\+?\s*(career\s+)?assists/i.test(label)) return "TOT_5000_AST";
  if (/2,?000\+?\s*(career\s+)?steals/i.test(label)) return "TOT_2000_STL";
  if (/1,?500\+?\s*(career\s+)?blocks/i.test(label)) return "TOT_1500_BLK";
  if (/2,?000\+?\s*made\s+threes/i.test(label)) return "TOT_2000_3PM";
  
  // season averages
  if (/30\+?\s*ppg/i.test(label)) return "AVG_30_PPG";
  if (/10\+?\s*apg/i.test(label)) return "AVG_10_APG";
  if (/15\+?\s*rpg/i.test(label)) return "AVG_15_RPG";
  if (/3\+?\s*bpg/i.test(label)) return "AVG_3_BPG";
  if (/2\.?5\+?\s*spg/i.test(label)) return "AVG_2p5_SPG";
  if (/50.?40.?90/i.test(label)) return "SEAS_504090";
  
  // leaders
  if (/led\s+league\s+in\s+scoring/i.test(label)) return "LED_PTS";
  if (/led\s+league\s+in\s+rebounds/i.test(label)) return "LED_REB";
  if (/led\s+league\s+in\s+assists/i.test(label)) return "LED_AST";
  if (/led\s+league\s+in\s+steals/i.test(label)) return "LED_STL";
  if (/led\s+league\s+in\s+blocks/i.test(label)) return "LED_BLK";
  
  // awards
  if (/mvp/i.test(label) && !/finals/i.test(label)) return "AWD_MVP";
  if (/all.?star|all\s+star/i.test(label) && !/35/i.test(label)) return "SEL_ALLSTAR";
  if (/all.?star.*35|35.*all.?star/i.test(label)) return "SEL_ALLSTAR_35";
  if (/champion|championship/i.test(label)) return "CHAMPION";
  if (/hall\s+of\s+fame/i.test(label)) return "HOF";
  
  // draft
  if (/#?1\s+overall|first\s+overall/i.test(label)) return "DRAFT_1OA";
  if (/first\s+round/i.test(label)) return "DRAFT_FIRST";
  if (/second\s+round/i.test(label)) return "DRAFT_SECOND";
  if (/undrafted/i.test(label)) return "UNDRAFTED";
  
  // meta
  if (/15\+?\s*seasons|played.*15.*seasons/i.test(label)) return "CAREER_15Y";
  if (/only\s+one\s+team/i.test(label)) return "ONLY_ONE_TEAM";
  
  return "UNKNOWN"; // fallback
}

// Sentence builder per spec C4
export function buildIncorrectSentence(e: EvalData): string {
  const p = e.playerName;

  // Team vs team
  if (e.row.kind==="team" && e.col.kind==="team") {
    const A = e.row.teamName!, B = e.col.teamName!;
    if (!e.teamPass && !e.critPass)
      return `<span class="bad">${p} played for neither the ${A} nor the ${B}</span>.`;
    if (e.teamPass && e.critPass)
      return `<span class="ok">${p} played for both the ${A} and the ${B}</span>.`;
    const pass = e.teamPass ? A : B;
    const fail = e.teamPass ? B : A;
    return `<span class="ok">${p} ${teamPos(pass)}</span> but <span class="bad">${p} ${teamNeg(fail)}</span>.`;
  }

  // Mixed (team + achievement)
  const teamCell = (e.row.kind==="team") ? e.row : e.col;
  const achCell  = (e.row.kind==="ach")  ? e.row : e.col;

  const teamClause = e.teamPass
    ? `<span class="ok">${p} ${teamPos(teamCell.teamName!)}</span>`
    : `<span class="bad">${p} ${teamNeg(teamCell.teamName!)}</span>`;

  const achId = mapLabelToId(achCell.achLabel!);
  const critClause = e.critPass
    ? `<span class="ok">${achPos(achId)}${e.parenthCrit ? " " + e.parenthCrit : ""}</span>`
    : `<span class="bad">${achNeg(achId)}${e.parenthCrit ? " " + e.parenthCrit : ""}</span>`;

  const joiner = (e.teamPass !== e.critPass) ? " but " : " and ";
  return teamClause + joiner + critClause + ".";
}

// Legacy function for compatibility - convert old format to new
export function buildIncorrectMessage(playerName: string, evaluation: EvaluationResult): string {
  // Map old evaluation to new format
  const achievementKeywords = ['PPG', 'APG', 'RPG', 'MVP', 'All-Star', 'Champion', 'Finals', 'Points', 'Rebounds', 'Assists', 'Blocks', 'Steals', 'Draft', 'Rookie', 'Hall of Fame', 'season', 'career', 'game', 'Overall', 'Round', 'Led League'];
  
  const teamLabelIsAchievement = achievementKeywords.some(keyword => evaluation.teamLabel.includes(keyword));
  const critLabelIsAchievement = achievementKeywords.some(keyword => evaluation.critLabel.includes(keyword));
  
  const evalData: EvalData = {
    playerName,
    row: teamLabelIsAchievement 
      ? { kind: "ach", achId: mapLabelToId(evaluation.teamLabel), achLabel: evaluation.teamLabel }
      : { kind: "team", teamName: evaluation.teamLabel },
    col: critLabelIsAchievement 
      ? { kind: "ach", achId: mapLabelToId(evaluation.critLabel), achLabel: evaluation.critLabel }
      : { kind: "team", teamName: evaluation.critLabel },
    teamPass: evaluation.teamPass,
    critPass: evaluation.critPass,
    parenthCrit: evaluation.parenthCrit
  };
  
  return buildIncorrectSentence(evalData);
}

// Evaluation function for player answers
export function evaluatePlayerAnswer(player: any, rowCriteria: any, colCriteria: any): EvaluationResult {
  // Basic evaluation logic - this would need to be implemented based on your criteria system
  const teamPass = true; // placeholder
  const critPass = true; // placeholder
  
  return {
    player: player.name,
    teamLabel: rowCriteria.label || "",
    critLabel: colCriteria.label || "",
    teamPass,
    critPass,
    correct: teamPass && critPass
  };
}