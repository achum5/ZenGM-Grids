interface StatsProps {
  sessionScore: number;
  correct: number;
  incorrect: number;
  guessesLeft: number;
  bestPerGuess?: number;
  avgPerGuess?: number;
}

export function Stats({ 
  sessionScore,
  correct, 
  incorrect, 
  guessesLeft, 
  bestPerGuess,
  avgPerGuess
}: StatsProps) {
  const hasGuesses = correct > 0;
  
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4 sm:p-6 rounded-xl shadow-sm">
      <div className="text-center mb-4">
        <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">STATS</h3>
      </div>
      
      {/* Big Score */}
      <div className="text-center mb-6">
        <div className="text-4xl sm:text-5xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-session-score">
          {sessionScore}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-300">(Session Score)</div>
      </div>
      
      {/* Separator */}
      <hr className="border-gray-300 dark:border-gray-600 mb-4" />
      
      {/* Stats row - responsive layout */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-gray-900 dark:text-white mb-4">
        <div className="text-center">
          <span className="text-sm font-medium">Correct: </span>
          <span className="font-bold text-green-600" data-testid="text-correct-answers">{correct}</span>
        </div>
        
        <div className="hidden sm:block text-gray-400">•</div>
        
        <div className="text-center">
          <span className="text-sm font-medium">Incorrect: </span>
          <span className="font-bold text-red-600" data-testid="text-incorrect-answers">{incorrect}</span>
        </div>
        
        <div className="hidden sm:block text-gray-400">•</div>
        
        <div className="text-center">
          <span className="text-sm font-medium">Left: </span>
          <span className="font-bold" data-testid="text-remaining-cells">{guessesLeft}</span>
        </div>
      </div>
      
      {/* Best/Avg row - only show if there are correct guesses */}
      {hasGuesses && bestPerGuess !== undefined && avgPerGuess !== undefined && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-gray-900 dark:text-white">
          <div className="text-center">
            <span className="text-sm font-medium">Best: </span>
            <span className="font-bold text-green-600" data-testid="text-best-per-guess">{bestPerGuess}</span>
          </div>
          
          <div className="hidden sm:block text-gray-400">•</div>
          
          <div className="text-center">
            <span className="text-sm font-medium">Avg: </span>
            <span className="font-bold text-blue-600" data-testid="text-avg-per-guess">{avgPerGuess.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  );
}