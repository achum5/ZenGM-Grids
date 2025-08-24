interface StatsProps {
  correct: number;
  incorrect: number;
  guessesLeft: number;
  totalRarity: number;
  avgRarity: number;
  best: number;
  worst: number;
  rarityScore?: number;
}

export function Stats({ 
  correct, 
  incorrect, 
  guessesLeft, 
  totalRarity, 
  avgRarity, 
  best, 
  worst, 
  rarityScore 
}: StatsProps) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4 sm:p-6 rounded-xl shadow-sm">
      <div className="text-center mb-4">
        <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Stats</h3>
      </div>
      
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-gray-900 dark:text-white">
        <div className="text-center">
          <div className="text-xl sm:text-2xl font-bold text-green-400" data-testid="text-correct-answers">
            {correct}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300">CORRECT</div>
        </div>
        
        <div className="text-center">
          <div className="text-xl sm:text-2xl font-bold text-red-400" data-testid="text-incorrect-answers">
            {incorrect}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300">INCORRECT</div>
        </div>
        
        <div className="text-center">
          <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-remaining-cells">
            {guessesLeft}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300">GUESSES LEFT</div>
        </div>
        
        <div className="text-center">
          <div className="text-lg sm:text-xl font-bold text-blue-400" data-testid="text-total-rarity">
            {totalRarity}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300">TOTAL RARITY</div>
        </div>
        
        <div className="text-center">
          <div className="text-lg sm:text-xl font-bold text-purple-400" data-testid="text-average-rarity">
            {avgRarity}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300">AVG RARITY</div>
        </div>
        
        {correct > 0 && (
          <>
            <div className="text-center">
              <div className="text-lg sm:text-xl font-bold text-green-300" data-testid="text-best-rarity">
                {best}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-300">BEST</div>
            </div>
            
            <div className="text-center">
              <div className="text-lg sm:text-xl font-bold text-orange-400" data-testid="text-worst-rarity">
                {worst}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-300">WORST</div>
            </div>
          </>
        )}
        
        {rarityScore !== undefined && (
          <div className="text-center">
            <div className="text-lg sm:text-xl font-bold text-yellow-400" data-testid="text-rarity-score">
              {rarityScore}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-300">RARITY SCORE</div>
          </div>
        )}
      </div>
    </div>
  );
}