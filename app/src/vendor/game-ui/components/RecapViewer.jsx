import { useMemo } from 'react';
import '../styles/theme.css';
import '../styles/game.css';
import { decodeRecapPayload } from '../game/recapShare';
import Brand from './Brand';
import VentureMakerLink from './VentureMakerLink';

const GENERIC_PROMPTS = [
  'What was the riskiest move made this game — did it pay off?',
  'If you played again, would you buy the same things? Why or why not?',
  "What's one thing you'd do differently next time?",
];

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

/**
 * The read-only page a shareable recap link (game/recapShare.js) opens —
 * mounted at the static `/recap` route by main.jsx (see that file). No
 * game state, no session, nothing but what's encoded in the URL's fragment
 * (`window.location.hash`) — so this renders identically for the sender
 * and for whoever they sent the link to, on any device, signed in or not.
 *
 * Ported from VentureFlow's src/components/RecapViewer.jsx — see
 * vf-source-snapshot-2026-08-23.md — dropping the setup.css import (Arena
 * has no equivalent stylesheet; every class this page uses — .vf-page,
 * .vf-card, .vf-recap*  — already lives in game.css) and pointing Brand /
 * VentureMakerLink / recapShare at their vendor/game-ui locations.
 *
 * Deliberately mirrors FamilyRecapModal's content (concepts touched, final
 * standings, talk-about-it prompts) plus the per-player insights
 * GameOverScreen shows, since this link is explicitly meant to reach
 * someone who ISN'T sitting at the table — a parent or teacher reviewing
 * after the fact — so it needs to stand on its own without any of the rest
 * of the app for context.
 */
export default function RecapViewer() {
  const payload = useMemo(() => {
    const hash = window.location.hash.replace(/^#/, '');
    return hash ? decodeRecapPayload(hash) : null;
  }, []);

  if (!payload) {
    return (
      <div className="vf-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="vf-card" style={{ maxWidth: 420, padding: '1.75rem', textAlign: 'center' }}>
          <Brand size="md" align="center" />
          <p style={{ marginTop: '1rem' }}>
            This recap link looks incomplete or damaged — the game data lives entirely in the link itself, so a
            trimmed or partially-copied link can't be read. Ask whoever sent it to resend the full link.
          </p>
        </div>
      </div>
    );
  }

  const { playedAt, scenario, difficulty, months, standings, concepts } = payload;

  return (
    <div className="vf-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1.25rem' }}>
      <div className="vf-card vf-recap" style={{ maxWidth: 560 }}>
        <div className="vf-recap__header">
          <Brand size="sm" align="left" />
        </div>
        <p className="vf-recap__scenario">
          {scenario.icon} {scenario.name} · {difficulty.icon} {difficulty.name} · {months} months
          {playedAt && <> · Played {formatDate(playedAt)}</>}
        </p>

        <div className="vf-recap__section-title">🏁 Final standings</div>
        <ul className="vf-recap__list">
          {standings.map((p, i) => (
            <li key={`${p.name}-${i}`}>
              #{i + 1} {p.avatar} {p.name}
              {p.type === 'ai' ? ' (AI)' : ''} — ${p.netWorth.toLocaleString()}
              {p.isWinner && ' 🏆'}
              {p.badges.length > 0 && <span className="vf-recap__badges"> · Badges: {p.badges.join(', ')}</span>}
              {p.insights.length > 0 && (
                <ul className="vf-recap__list" style={{ marginTop: '0.3rem' }}>
                  {p.insights.map((text) => (
                    <li key={text} style={{ fontSize: '0.85rem', color: 'var(--vf-ink-soft)' }}>
                      {text}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        <div className="vf-recap__section-title">💡 Concepts this game touched on</div>
        {concepts.length === 0 ? (
          <p className="vf-recap__empty">Nothing new came up this particular game.</p>
        ) : (
          <ul className="vf-recap__list">
            {concepts.map((c) => (
              <li key={c.title}>
                <strong>
                  {c.icon} {c.title}:
                </strong>{' '}
                {c.blurb}
              </li>
            ))}
          </ul>
        )}

        <div className="vf-recap__section-title">🗣️ Talk about it</div>
        <ul className="vf-recap__list">
          {GENERIC_PROMPTS.map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>

        <p style={{ marginTop: '1rem', fontSize: '0.78rem', color: 'var(--vf-ink-soft)' }}>
          This is a shared recap of a VentureArena game — nothing here requires an account or the app installed.
        </p>
        <VentureMakerLink />
      </div>
    </div>
  );
}
