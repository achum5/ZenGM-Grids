import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionStats } from "@shared/schema";

interface GameStatsProps {
  stats?: SessionStats;
  currentSessionScore?: number; // Add per spec point 8 
  isGameActive?: boolean; // Add to show different UI during active game
}

export function GameStats({ stats, currentSessionScore = 0, isGameActive = false }: GameStatsProps) {
  // During active game, emphasize current session score per spec point 8
  if (isGameActive) {
    return (
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-center text-lg">Current Session</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-center mb-4">
            <div className="text-5xl font-bold text-blue-600 dark:text-blue-400 mb-1" data-testid="text-current-session-score">
              {currentSessionScore}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">points</div>
          </div>
          
          {stats && (
            <div className="border-t pt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Best Score</span>
                <span className="font-semibold text-green-600 dark:text-green-400" data-testid="text-best-score">
                  {stats.bestScore}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Grids Completed</span>
                <span className="font-semibold" data-testid="text-grids-completed">
                  {stats.gridsCompleted}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // No game active - show comprehensive session stats per spec point 8
  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Session Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500 py-4">
            No games played yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session Stats</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Grids Completed</span>
            <span className="font-semibold" data-testid="text-grids-completed">
              {stats.gridsCompleted}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Average Score</span>
            <span className="font-semibold" data-testid="text-average-score">
              {stats.averageScore}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Best Score</span>
            <span className="font-semibold text-green-600 dark:text-green-400" data-testid="text-best-score">
              {stats.bestScore}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Success Rate</span>
            <span className="font-semibold" data-testid="text-success-rate">
              {stats.successRate}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
