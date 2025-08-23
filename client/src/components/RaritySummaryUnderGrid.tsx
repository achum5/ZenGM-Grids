// src/components/RaritySummaryUnderGrid.tsx
type Sample = { cellKey: string; pid: number; rarity: number; correct: boolean };

export default function RaritySummaryUnderGrid({ samples }: { samples: Sample[] }) {
  const vals = samples.filter(s => s.correct && Number.isFinite(s.rarity)).map(s => s.rarity);
  const total = vals.reduce((a,b)=>a+b, 0);
  const avg = vals.length ? Math.round((total/vals.length)*10)/10 : 0;
  const best = vals.length ? Math.max(...vals) : 0;   // now best = HIGHEST
  const mostCommon = vals.length ? Math.min(...vals) : 0;

  return (
    <div style={{
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      background: "rgba(255,255,255,0.05)",
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: 8
    }}>
      <Stat label="Rarity Score (total)" value={total} />
      <Stat label="Average" value={avg} />
      <Stat label="Best pick" value={best} hint="highest rarity" />
      <Stat label="Most common" value={mostCommon} hint="lowest rarity" />
    </div>
  );
}

function Stat({ label, value, hint }:{label:string; value:number|string; hint?:string}) {
  return (
    <div>
      <div style={{opacity:.7, fontSize:12}}>{label}</div>
      <div style={{fontWeight:800, fontSize:18}}>{value}</div>
      {hint ? <div style={{opacity:.55, fontSize:11}}>{hint}</div> : null}
    </div>
  );
}