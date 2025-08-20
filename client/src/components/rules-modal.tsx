import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface RulesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RulesModal({ open, onOpenChange }: RulesModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How to Play</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 text-sm text-gray-700 dark:text-white">
          <div>
            <h4 className="font-semibold text-court mb-2">Objective</h4>
            <p>Fill the 3x3 grid with players who satisfy both the row and column criteria.</p>
          </div>
          
          <div>
            <h4 className="font-semibold text-court mb-2">Rules</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Each cell must contain a player who meets both row and column requirements</li>
              <li>You have 9 guesses total (one per cell)</li>
              <li>Incorrect guesses count against your score</li>
              <li>Rarer picks score higher points</li>
              <li>You can only use each player once per grid</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-court mb-2">Scoring</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Correct answer: +1 point</li>
              <li>Bonus points for obscure/rare picks</li>
              <li>Perfect grid (9/9): Bonus multiplier</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-court mb-2">File Upload</h4>
            <p>Upload your own league data in CSV or JSON format to create custom grids with different teams, years, and criteria.</p>
          </div>

          <div>
            <h4 className="font-semibold text-court mb-2">File Format</h4>
            <div className="space-y-2">
              <p><strong>CSV Format:</strong> Include columns for name, teams, achievements</p>
              <p><strong>JSON Format:</strong> Array of player objects with name, teams (array), achievements (array)</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
