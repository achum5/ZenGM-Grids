import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionStats } from "@shared/schema";

interface GameStatsProps {
  stats?: SessionStats;
}

export function GameStats({ stats }: GameStatsProps) {
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
            <span className="text-gray-600">Grids Completed</span>
            <span className="font-semibold" data-testid="text-grids-completed">
              {stats.gridsCompleted}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Average Score</span>
            <span className="font-semibold" data-testid="text-average-score">
              {stats.averageScore}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Best Score</span>
            <span className="font-semibold text-green-600" data-testid="text-best-score">
              {stats.bestScore}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Success Rate</span>
            <span className="font-semibold" data-testid="text-success-rate">
              {stats.successRate}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
