import { useMemo } from 'react';

// Pure decoration — bright bursts of color celebrating the win. No sound of
// its own (see soundLibrary.js's `gameover` sound, which layers fireworks +
// cheering audio on top of the victory fanfare); this just draws it.
const COLORS = [
  'var(--vf-teal)',
  'var(--vf-orange)',
  'var(--vf-yellow)',
  'var(--vf-green)',
  'var(--vf-red)',
  'var(--vf-blue)',
  'var(--vf-purple)',
  'var(--vf-pink)',
];

function buildBurst(originX, originY, delayBase, count) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const distance = 60 + Math.random() * 80;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance + 30; // a little downward drift, like gravity
    particles.push({
      key: `${originX}-${originY}-${i}`,
      style: {
        '--ox': `${originX}%`,
        '--oy': `${originY}%`,
        '--dx': `${dx.toFixed(1)}px`,
        '--dy': `${dy.toFixed(1)}px`,
        '--color': COLORS[Math.floor(Math.random() * COLORS.length)],
        '--dur': `${(0.9 + Math.random() * 0.5).toFixed(2)}s`,
        '--delay': `${(delayBase + Math.random() * 0.15).toFixed(2)}s`,
      },
    });
  }
  return particles;
}

const ORIGINS = [
  { x: 16, y: 16, delay: 0 },
  { x: 50, y: 8, delay: 0.35 },
  { x: 84, y: 18, delay: 0.7 },
  { x: 30, y: 30, delay: 1.1 },
  { x: 70, y: 26, delay: 1.5 },
];

export default function Fireworks() {
  // Computed once per mount (GameOverScreen mounts fresh each time the game
  // ends), so every win gets its own randomized show.
  const particles = useMemo(() => ORIGINS.flatMap((o) => buildBurst(o.x, o.y, o.delay, 14)), []);

  return (
    <div className="vf-fireworks" aria-hidden="true">
      {particles.map((p) => (
        <span key={p.key} className="vf-firework-particle" style={p.style} />
      ))}
    </div>
  );
}
