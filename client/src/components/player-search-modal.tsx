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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Player</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search for a player..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-player-search"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {isLoading && searchQuery && (
              <div className="text-center py-4 text-gray-500">Searching...</div>
            )}
            
            {!isLoading && searchQuery && players.length === 0 && (
              <div className="text-center py-4 text-gray-500">No players found</div>
            )}
            
            {!searchQuery && (
              <div className="text-center py-4 text-gray-500">
                Start typing to search for players
              </div>
            )}

            {players.map((player) => (
              <Button
                key={player.id}
                variant="outline"
                className="w-full text-left p-3 h-auto justify-start"
                onClick={() => handlePlayerSelect(player.name)}
                data-testid={`button-select-player-${player.id}`}
              >
                <div>
                  <div className="font-medium text-court">{player.name}</div>
                  <div className="text-sm text-gray-500">
                    {player.teams.join(", ")}
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
