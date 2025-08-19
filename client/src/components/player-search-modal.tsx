import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Player } from "@shared/schema";

interface PlayerSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPlayer: (playerName: string) => void;
}

export function PlayerSearchModal({ open, onOpenChange, onSelectPlayer }: PlayerSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: [`/api/players/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: open && searchQuery.length > 0,
  });

  const handlePlayerSelect = (playerName: string) => {
    onSelectPlayer(playerName);
    setSearchQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg mx-auto">
        <DialogHeader className="text-center pb-6">
          <DialogTitle className="text-2xl font-bold text-basketball">Select Player</DialogTitle>
          <p className="text-gray-600 mt-2">Find the player who matches both criteria</p>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              placeholder="Search for a player..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 py-3 text-lg border-2 border-gray-200 focus:border-basketball rounded-xl shadow-sm"
              data-testid="input-player-search"
            />
          </div>

          <div className="max-h-80 overflow-y-auto space-y-3 px-1">
            {isLoading && searchQuery && (
              <div className="flex flex-col items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-basketball mb-4"></div>
                <div className="text-gray-500 font-medium">Searching players...</div>
              </div>
            )}
            
            {!isLoading && searchQuery && players.length === 0 && (
              <div className="flex flex-col items-center py-12">
                <div className="text-6xl mb-4">🔍</div>
                <div className="text-gray-500 font-medium text-lg">No players found</div>
                <div className="text-gray-400 text-sm mt-1">Try a different search term</div>
              </div>
            )}
            
            {!searchQuery && (
              <div className="flex flex-col items-center py-12">
                <div className="text-6xl mb-4">🏀</div>
                <div className="text-gray-500 font-medium text-lg">Start typing to search</div>
                <div className="text-gray-400 text-sm mt-1">Enter a player's name to find matches</div>
              </div>
            )}

            {players.map((player) => (
              <Button
                key={player.id}
                variant="outline"
                className="w-full text-left p-4 h-auto justify-start border-2 border-gray-200 hover:border-basketball hover:bg-orange-50 transition-all duration-200 rounded-xl group"
                onClick={() => handlePlayerSelect(player.name)}
                data-testid={`button-select-player-${player.id}`}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-basketball text-white rounded-full flex items-center justify-center font-bold text-lg group-hover:bg-orange-600 transition-colors">
                    {player.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-court text-lg group-hover:text-basketball transition-colors">
                      {player.name}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      <span className="font-medium">Teams:</span> {player.teams.slice(0, 3).join(", ")}
                      {player.teams.length > 3 && (
                        <span className="text-xs ml-1">+{player.teams.length - 3} more</span>
                      )}
                    </div>
                    {player.achievements && player.achievements.length > 0 && (
                      <div className="text-xs text-gray-400 mt-1">
                        <span className="font-medium">Achievements:</span> {player.achievements.slice(0, 2).join(", ")}
                        {player.achievements.length > 2 && (
                          <span className="ml-1">+{player.achievements.length - 2} more</span>
                        )}
                      </div>
                    )}
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
