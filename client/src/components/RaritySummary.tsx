import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { 
  picked: Array<{ correct: boolean; rarity?: number }> 
};

export default function RaritySummary({ picked }: Props) {
  const vals = picked.filter(p => p.correct && typeof p.rarity === "number").map(p => p.rarity as number);
  const total = vals.reduce((a,b)=>a+b,0);
  const avg = vals.length ? Math.round((total/vals.length)*10)/10 : 0;
  const best = vals.length ? Math.max(...vals) : 0;
  const worst = vals.length ? Math.min(...vals) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rarity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Total</span>
            <span className="font-semibold" data-testid="text-rarity-total">
              {total}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Average</span>
            <span className="font-semibold" data-testid="text-rarity-average">
              {avg}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Best Pick</span>
            <span className="font-semibold text-purple-600" data-testid="text-rarity-best">
              {best}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Most Common</span>
            <span className="font-semibold text-teal-600" data-testid="text-rarity-worst">
              {worst > 0 ? worst : '—'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}