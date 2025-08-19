import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Player } from "@shared/schema";
import { PlayerFace } from "./player-face";

interface PlayerSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPlayer: (playerName: string) => void;
}

export function PlayerSearchModal({ open, onOpenChange, onSelectPlayer }: PlayerSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: [`/api/players/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: open && searchQuery.length > 0,
  });

  const handlePlayerSelect = (playerName: string) => {
    onSelectPlayer(playerName);
    setSearchQuery("");
    setSelectedIndex(0);
  };

  // Reset selected index when search results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [players]);

  // Focus input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && players.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, players]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (players.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, players.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (players[selectedIndex]) {
          handlePlayerSelect(players[selectedIndex].name);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onOpenChange(false);
        break;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-lg mx-auto bg-slate-800 border-slate-700" 
        aria-describedby="player-search-description" 
        onKeyDown={handleKeyDown}
        style={{ pointerEvents: 'auto' }}
      >
        <DialogHeader className="text-center pb-6">
          <DialogTitle className="text-xl font-bold text-white">Select Player</DialogTitle>
          <p id="player-search-description" className="text-gray-400 mt-2 text-sm">Find the player who matches both criteria</p>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              ref={inputRef}
              placeholder="Search for a player..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 py-2 bg-slate-700 border-slate-600 text-white placeholder-gray-400 focus:border-blue-400 rounded-lg"
              data-testid="input-player-search"
            />
          </div>

          <div 
            ref={listRef} 
            className="max-h-64 overflow-y-auto space-y-2 overscroll-contain"
            style={{ scrollBehavior: 'auto' }}
          >
            {isLoading && searchQuery && (
              <div className="flex flex-col items-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mb-3"></div>
                <div className="text-gray-400 text-sm">Searching players...</div>
              </div>
            )}
            
            {!isLoading && searchQuery && players.length === 0 && (
              <div className="flex flex-col items-center py-8">
                <div className="text-gray-500 text-sm">No players found</div>
                <div className="text-gray-600 text-xs mt-1">Try a different search term</div>
              </div>
            )}
            
            {!searchQuery && (
              <div className="flex flex-col items-center py-8">
                <div className="text-gray-500 text-sm">Start typing to search</div>
                <div className="text-gray-600 text-xs mt-1">Enter a player's name</div>
              </div>
            )}

            {players.map((player, index) => (
              <Button
                key={player.id}
                variant="ghost"
                className={`w-full text-left p-3 h-auto justify-start transition-all duration-200 rounded-lg border ${
                  index === selectedIndex
                    ? "bg-blue-600 border-blue-500 shadow-lg" 
                    : "bg-slate-700 hover:bg-slate-600 border-slate-600 hover:border-slate-500"
                }`}
                onClick={() => handlePlayerSelect(player.name)}
                data-testid={`button-select-player-${player.id}`}
              >
                <div className="flex items-center space-x-3 w-full">
                  <PlayerFace 
                    face={player.face} 
                    size={32} 
                    className="rounded-full overflow-hidden flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white text-sm truncate">
                      {player.name}
                    </div>
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
