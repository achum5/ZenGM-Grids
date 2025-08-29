let _leagueData: any = null;
export function setLeagueInMemory(v:any){ _leagueData = v; }
export function getLeagueInMemory<T=any>(): T | null { return _leagueData as T | null; }