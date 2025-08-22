// client/src/components/player-career-stats.tsx
import { useMemo } from "react";
import { getCareerTotalsRS, getCareerAveragesRS } from "@shared/utils/careerStats";
import type { Player } from "@shared/schema";

type Props = { player: Player };

export default function PlayerCareerStats({ player }: Props) {
  // Convert the player object to match the expected format
  const careerPlayer = useMemo(() => ({
    pid: parseInt(player.id) || 0,
    firstName: player.name.split(' ')[0] || '',
    lastName: player.name.split(' ').slice(1).join(' ') || '',
    stats: player.stats ? Object.values(player.stats) : []
  }), [player]);

  // Regular season only
  const totals = useMemo(() => getCareerTotalsRS(careerPlayer), [careerPlayer]);
  const avg = useMemo(() => getCareerAveragesRS(totals), [totals]);

  return (
    <div className="player-career-stats">
      {/* Averages FIRST */}
      <div className="stat-card bg-white/5 dark:bg-black/20 rounded-xl p-3 mt-2">
        <div className="font-semibold mb-2 text-sm">Career Averages (Regular Season)</div>
        <div className="flex flex-wrap gap-3 mb-2">
          <Stat label="PPG" value={avg.ppg.toFixed(1)} />
          <Stat label="RPG" value={avg.rpg.toFixed(1)} />
          <Stat label="APG" value={avg.apg.toFixed(1)} />
          <Stat label="SPG" value={avg.spg.toFixed(1)} />
          <Stat label="BPG" value={avg.bpg.toFixed(1)} />
          <Stat label="MPG" value={avg.mpg.toFixed(1)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Stat label="FG%" value={`${avg.fgp.toFixed(1)}%`} />
          <Stat label="3P%" value={`${avg.tpp.toFixed(1)}%`} />
          <Stat label="FT%" value={`${avg.ftp.toFixed(1)}%`} />
        </div>
      </div>

      {/* Totals SECOND */}
      <div className="stat-card bg-white/5 dark:bg-black/20 rounded-xl p-3 mt-2">
        <div className="font-semibold mb-2 text-sm">Career Totals (Regular Season)</div>
        <div className="flex flex-wrap gap-3 mb-2">
          <Stat label="GP" value={totals.gp} />
          <Stat label="PTS" value={totals.pts} />
          <Stat label="REB" value={totals.orb + totals.drb} />
          <Stat label="AST" value={totals.ast} />
          <Stat label="STL" value={totals.stl} />
          <Stat label="BLK" value={totals.blk} />
          <Stat label="MIN" value={Math.round(totals.min)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Stat label="FG" value={`${totals.fg}/${totals.fga}`} />
          <Stat label="3P" value={`${totals.tp}/${totals.tpa}`} />
          <Stat label="FT" value={`${totals.ft}/${totals.fta}`} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-16 mr-3">
      <div className="opacity-70 text-xs">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
}