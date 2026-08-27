import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { netWorth, passiveIncome, businessPauseStatus, allowanceModifierPercent } from '../../game-engine/players';
import { getBadgeInfo } from '../../game-engine/badges';
import { getSkillLevel } from '../../data/gameConfig';
import { businessHealthStatus } from '../../game-engine/businessUpgrades';
import WealthPile from './WealthPile';

/** "🤖 GrumpyMommy · 🦈 Shark" for a robot with a known skill level, or a
 * plain "AI player" for one saved before this feature existed. */
function botTooltip(player) {
  if (!player.skillLevelId) return 'AI player';
  const skill = getSkillLevel(player.skillLevelId);
  return `${player.name} · ${skill.icon} ${skill.name}`;
}

// Worst business-health status across everything this player owns, for the
// invest CTA below to flag ('declining' beats 'warning' beats 'healthy') —
// a quick heads-up without having to open the portfolio to notice a
// business has gone untended (see game/businessUpgrades.js's
// businessHealthStatus / gameConfig.js's BUSINESS_DECLINE_* comment).
const HEALTH_RANK = { declining: 2, warning: 1, healthy: 0 };
function worstBusinessHealth(player, month) {
  let worst = 'healthy';
  for (const biz of player.businesses) {
    const status = businessHealthStatus(biz, month);
    if (HEALTH_RANK[status] > HEALTH_RANK[worst]) worst = status;
  }
  return worst;
}

function PlayerCard({ player, prices, allPlayers, month, weatherIncomeAmounts, isActive, isMine, onSelect, cardRef }) {
  const worstHealth = worstBusinessHealth(player, month);
  // A robot's card opens the same portfolio modal, but read-only — so its
  // button says what it actually does ("View businesses") instead of
  // inviting the human to invest in someone else's company. The health
  // warnings below are likewise a nudge aimed at the OWNER of the
  // businesses, so they only appear on a human player's own card; a bot's
  // neglected business is the bot's problem, and flagging it here would
  // read as something the player is supposed to fix.
  //
  // `isMine` is undefined in solo/hotseat (every human card there IS
  // controllable from this one device, so the distinction doesn't apply —
  // see PlayerPanel's own prop) and a real player-id comparison in the
  // Arena's online mode, where another human's card must read the same
  // read-only way a bot's does: you can look, you can't invest for them.
  const isBot = player.type === 'ai' || isMine === false;
  // Temporary fortune-card shocks, surfaced on the card itself. A player
  // whose income silently halves has no way to find out why otherwise —
  // the card that did it has long since scrolled out of the event log.
  const pause = businessPauseStatus(player, month);
  const allowancePct = allowanceModifierPercent(player, month);
  const playerNetWorth = netWorth(player, prices);
  // A <button> can't legally contain another <button> (the invest CTA
  // below), so the whole-card tap target is a div with button semantics
  // bolted on (role/tabIndex/Enter+Space) instead of a real <button> — see
  // game.css's .vf-player-card, which was already styled generically
  // enough (appearance: none, cursor: pointer) not to depend on the tag.
  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      className={`vf-card vf-player-card ${isActive ? 'vf-player-card--active' : ''}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="vf-player-card__name">
        <span>{player.avatar}</span>
        <span>{player.name}</span>
        {player.type === 'ai' && <span title={botTooltip(player)}>🤖</span>}
        <WealthPile netWorth={playerNetWorth} />
      </div>
      <div className="vf-player-card__networth">${playerNetWorth.toLocaleString()}</div>
      <div className="vf-player-card__stat">💵 Cash: ${Math.round(player.cash).toLocaleString()}</div>
      <div className="vf-player-card__stat">
        🌱 Passive: ${passiveIncome(player, { allPlayers, prices, month, weatherIncomeAmounts })}/mo · 💡 {player.skillTokens}
      </div>
      {(pause || allowancePct !== 0) && (
        <div className="vf-player-card__shocks">
          {pause && (
            <span
              className="vf-shock-chip vf-shock-chip--bad"
              title="A fortune card stopped this player's businesses earning. It comes back on its own."
            >
              🛑 No business income · {pause.monthsLeft} mo
            </span>
          )}
          {allowancePct !== 0 && (
            <span
              className={`vf-shock-chip ${allowancePct > 0 ? 'vf-shock-chip--good' : 'vf-shock-chip--bad'}`}
              title="A fortune card temporarily changed this player's monthly allowance."
            >
              {allowancePct > 0 ? '📈' : '📉'} Allowance {allowancePct > 0 ? '+' : ''}
              {allowancePct}%
            </span>
          )}
        </div>
      )}
      {player.badges.length > 0 && (
        <div className="vf-player-card__badges">
          {player.badges.map((badgeId) => {
            const badge = getBadgeInfo(badgeId);
            if (!badge) return null;
            return (
              <span key={badgeId} className="vf-badge-chip" title={badge.description}>
                {badge.icon} {badge.name}
              </span>
            );
          })}
        </div>
      )}
      <div className="vf-player-card__tap-hint">🔍 Tap for portfolio details</div>
      <button
        type="button"
        className={`vf-btn vf-btn--sm vf-btn--block vf-player-card__invest-btn ${
          isBot
            ? 'vf-btn--ghost'
            : worstHealth === 'declining'
            ? 'vf-btn--danger'
            : worstHealth === 'warning'
            ? 'vf-player-card__invest-btn--warning'
            : 'vf-btn--warm'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {isBot
          ? '🔍 View businesses'
          : worstHealth === 'declining'
          ? '📉 A business is losing money — reinvest now!'
          : worstHealth === 'warning'
          ? '⚠️ A business needs attention soon'
          : '⚙️ Invest in your businesses!'}
      </button>
    </div>
  );
}

const SPOTLIGHT_EPSILON = 0.5;
function sameRect(a, b) {
  return (
    Math.abs(a.x - b.x) < SPOTLIGHT_EPSILON &&
    Math.abs(a.y - b.y) < SPOTLIGHT_EPSILON &&
    Math.abs(a.width - b.width) < SPOTLIGHT_EPSILON &&
    Math.abs(a.height - b.height) < SPOTLIGHT_EPSILON
  );
}

/**
 * The players strip, with a travelling turn spotlight.
 *
 * The spotlight is a single absolutely-positioned element inside the grid,
 * moved onto whichever card is active and CSS-transitioned there — so as the
 * turn passes around the table you SEE the light slide from one player to the
 * next, rather than one card simply lighting up while another goes dark. With
 * the speed slider turned down (game/playSpeed.js) that travel is slow enough
 * to follow deliberately; `spotlightMs` comes straight from the current speed,
 * so the light is always settling in just as the new turn begins.
 *
 * Its position is MEASURED from the live DOM rather than computed, because
 * the grid is `auto-fit`/`minmax` and reflows to 1, 2, or 3 columns depending
 * on viewport width — there's no layout formula to copy here that wouldn't
 * silently drift from the CSS. A ResizeObserver on the container and on every
 * card keeps it correct through window resizes and through a card growing on
 * its own (a new badge chip, a longer net-worth number).
 *
 * `setRect` is guarded by a same-rect check: measuring on every render and
 * storing a fresh object unconditionally would re-trigger the measure effect
 * and spin forever.
 */
export default function PlayerPanel({
  players,
  prices,
  month,
  weatherIncomeAmounts,
  activePlayerIndex,
  onSelectPlayer,
  spotlightMs = 550,
  // Arena-only: the caller's own player id, so another human's card reads
  // read-only the same way a bot's does. Omitted (undefined) in solo/
  // hotseat, where every human card is controllable from this device and
  // PlayerCard's isBot check already falls back to `player.type === 'ai'`.
  myPlayerId,
}) {
  const containerRef = useRef(null);
  const cardRefs = useRef([]);
  const [rect, setRect] = useState(null);
  // Skip the travel animation on the very first placement (and after a
  // remount) so the spotlight doesn't fly in from the board's top-left
  // corner when a game loads or resumes.
  const placedRef = useRef(false);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const target = cardRefs.current[activePlayerIndex];
    if (!container || !target) {
      setRect(null);
      return;
    }
    const c = container.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const next = { x: t.left - c.left, y: t.top - c.top, width: t.width, height: t.height };
    setRect((prev) => (prev && sameRect(prev, next) ? prev : next));
  }, [activePlayerIndex]);

  useLayoutEffect(() => {
    measure();
  }, [measure, players.length]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      // Very old browser: window resize still covers the common case.
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    for (const el of cardRefs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [measure, players.length]);

  useEffect(() => {
    if (rect) placedRef.current = true;
  }, [rect]);

  return (
    <div className="vf-players" ref={containerRef}>
      {rect && (
        <div
          className={`vf-spotlight ${placedRef.current ? 'vf-spotlight--travelling' : ''}`}
          aria-hidden="true"
          style={{
            transform: `translate(${rect.x}px, ${rect.y}px)`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            '--vf-spotlight-ms': `${spotlightMs}ms`,
          }}
        />
      )}
      {players.map((player, i) => (
        <PlayerCard
          key={player.id}
          player={player}
          prices={prices}
          allPlayers={players}
          month={month}
          weatherIncomeAmounts={weatherIncomeAmounts}
          isActive={i === activePlayerIndex}
          isMine={myPlayerId === undefined ? undefined : player.id === myPlayerId}
          onSelect={() => onSelectPlayer(player.id)}
          cardRef={(el) => {
            cardRefs.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}
