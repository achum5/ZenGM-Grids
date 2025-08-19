import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { CheckCircle } from "lucide-react";
import type { Player } from "@shared/schema";

interface CorrectAnswersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  correctPlayers: string[];
  playerDetails: Player[];
  cellCriteria: { row: string; column: string };
}

export function CorrectAnswersModal({ 
  open, 
  onOpenChange, 
  correctPlayers, 
  playerDetails,
  cellCriteria 
}: CorrectAnswersModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl mx-auto bg-slate-800 border-slate-700" aria-describedby="correct-answers-description">
        <DialogHeader className="text-center pb-4">
          <div className="flex items-center justify-center space-x-2 mb-2">
            <CheckCircle className="h-6 w-6 text-green-400" />
            <DialogTitle className="text-xl font-bold text-white">Correct!</DialogTitle>
          </div>
          <p id="correct-answers-description" className="text-gray-400 text-sm">
            Players who played for both {cellCriteria.row} and {cellCriteria.column}
          </p>
        </DialogHeader>
        
        <div className="max-h-96 overflow-y-auto">
          <div className="space-y-3">
            {correctPlayers.map((playerName, index) => {
              const player = playerDetails.find(p => p.name === playerName);
              return (
                <div 
                  key={playerName} 
                  className="bg-slate-700 rounded-lg p-4 border border-slate-600"
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      {playerName.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white text-lg">{playerName}</h3>
                      
                      {player && (
                        <div className="mt-2 space-y-1">
                          <div className="text-sm text-gray-300">
                            <span className="font-medium">Teams:</span> {player.teams.join(", ")}
                          </div>
                          
                          {player.achievements && player.achievements.length > 0 && (
                            <div className="text-sm text-gray-300">
                              <span className="font-medium">Awards:</span> {player.achievements.join(", ")}
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-400">
                            Career Win Shares: {((player.careerWinShares || 0) / 10).toFixed(1)}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <div className="text-sm font-medium text-green-400">
                        {player?.quality || 50}%
                      </div>
                      <div className="text-xs text-gray-400">Quality</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="flex justify-center pt-4">
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="button-close-correct-answers"
          >
            Continue Playing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}