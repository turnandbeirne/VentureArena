// Ranked color choice: tap colors in order of preference (up to three).
// The first free one in this order is what you get at any table — see
// vm_assign_seat_colors in migration 0006 for the exact fallback rule.
export default function ColorPicker({ colors, ranks, onChange }) {
  function toggle(key) {
    if (ranks.includes(key)) onChange(ranks.filter((k) => k !== key));
    else if (ranks.length < 3) onChange([...ranks, key]);
  }
  const byKey = Object.fromEntries(colors.map((c) => [c.key, c]));
  return (
    <div className="va-colors">
      <div className="va-color-grid">
        {colors.map((c) => {
          const rank = ranks.indexOf(c.key);
          return (
            <button
              type="button"
              key={c.key}
              className={`va-color-swatch ${rank >= 0 ? 'picked' : ''}`}
              style={{ background: c.hex }}
              onClick={() => toggle(c.key)}
              aria-label={`${c.name}${rank >= 0 ? `, choice ${rank + 1}` : ''}`}
              title={c.name}
            >
              {rank >= 0 && <span className="va-color-rank">{rank + 1}</span>}
            </button>
          );
        })}
      </div>
      <p className="va-color-summary">
        {ranks.length === 0
          ? 'Pick up to three colors in order. If your first choice is taken at a table, you get your second.'
          : `Your colors: ${ranks.map((k, i) => `${i + 1}. ${byKey[k]?.name ?? k}`).join('  ')}`}
      </p>
    </div>
  );
}
