import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InsertPlayer, TeamInfo, FileUploadData } from "@shared/schema";

interface LeagueState {
  league: any | null;
  players: InsertPlayer[];
  teams: TeamInfo[];
  achievements: string[];
  isLoaded: boolean;
  
  // Actions
  setLeague: (league: any, data: FileUploadData) => void;
  clear: () => void;
}

export const useLeagueStore = create<LeagueState>()(
  persist(
    (set) => ({
      league: null,
      players: [],
      teams: [],
      achievements: [],
      isLoaded: false,
      
      setLeague: (league, data) => set({ 
        league, 
        players: data.players, 
        teams: data.teams,
        achievements: data.achievements,
        isLoaded: true 
      }),
      
      clear: () => set({ 
        league: null, 
        players: [], 
        teams: [],
        achievements: [],
        isLoaded: false 
      }),
    }),
    {
      name: "bbgm-grid-session",
      partialize: (state) => ({
        // Don't persist the full league object to save space
        league: null,
        players: state.players,
        teams: state.teams,
        achievements: state.achievements,
        isLoaded: state.isLoaded
      })
    }
  )
);