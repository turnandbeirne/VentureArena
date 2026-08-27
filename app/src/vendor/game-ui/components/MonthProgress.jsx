export default function MonthProgress({ month, totalMonths }) {
  const pct = Math.min(100, Math.round(((month - 1) / totalMonths) * 100));
  return (
    <div className="vf-progress">
      <div className="vf-progress__track">
        <div className="vf-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="vf-progress__label">
        Month {month} of {totalMonths}
      </div>
    </div>
  );
}
