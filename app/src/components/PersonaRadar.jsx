// Six style dimensions on a radar. Scale is fixed 0–100 so two members'
// charts are comparable side by side.
const DIMS = [
  ['risk', 'Risk'],
  ['horizon', 'Horizon'],
  ['negotiation', 'Negotiation'],
  ['cooperation', 'Cooperation'],
  ['speed', 'Speed'],
  ['resilience', 'Resilience'],
];

export default function PersonaRadar({ persona, size = 220, color = '#1f6a4b' }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 34;
  const pt = (i, v) => {
    const a = (Math.PI * 2 * i) / DIMS.length - Math.PI / 2;
    return [cx + Math.cos(a) * r * (v / 100), cy + Math.sin(a) * r * (v / 100)];
  };
  const ring = (v) => DIMS.map((_, i) => pt(i, v).join(',')).join(' ');
  const values = DIMS.map(([k]) => Number(persona?.[k] ?? 50));
  const shape = values.map((v, i) => pt(i, v).join(',')).join(' ');
  return (
    <svg className="va-radar" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Playing style radar">
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={ring(v)} fill="none" stroke="currentColor" strokeOpacity="0.12" />
      ))}
      {DIMS.map((_, i) => {
        const [x, y] = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" strokeOpacity="0.12" />;
      })}
      <polygon points={shape} fill={color} fillOpacity="0.28" stroke={color} strokeWidth="2" />
      {values.map((v, i) => {
        const [x, y] = pt(i, v);
        return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
      })}
      {DIMS.map(([, label], i) => {
        const [x, y] = pt(i, 122);
        return (
          <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="currentColor" fillOpacity="0.75">
            {label}
          </text>
        );
      })}
    </svg>
  );
}
