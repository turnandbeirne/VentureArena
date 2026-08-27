import { useMemo, useState } from 'react';
import { BUSINESS_COST, BUSINESS_SKILL_COST, BUSINESS_NAMES } from '../../data/gameConfig';
import { businessArt } from '../game/businessArt';
import { playSound } from '../audio/soundEngine';

const SUGGESTION_COUNT = 4;

/** `n` distinct random picks from `pool`, skipping anything in `used` when
 * there's enough pool left to still fill the count — a player deep into a
 * game shouldn't run out of fresh-feeling suggestions, but also shouldn't
 * be blocked if they truly have used most of the list. Plain Math.random,
 * not the seeded game RNG (game-engine/rng.js): which four names get SHOWN
 * as options has no effect on game state, so it must stay outside the
 * seeded stream every connected client needs to agree on — only the name
 * the player actually CONFIRMS ever reaches the reducer (and every other
 * client learns it from the persisted move, not from re-running this
 * sampling itself). */
function sampleNames(pool, used, n) {
  const usedSet = new Set(used);
  const fresh = pool.filter((name) => !usedSet.has(name));
  const source = fresh.length >= n ? fresh : pool;
  const copy = [...source];
  const picks = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    picks.push(copy.splice(idx, 1)[0]);
  }
  return picks;
}

/**
 * The step between tapping "Start Business" and the launch celebration
 * (StartupLaunchModal) — lets the player either type their own company
 * name or pick one of a few whimsical suggestions, each shown with a live
 * preview of the storefront art it'll get (see game/businessArt.js, which
 * derives the icon/colors purely from the NAME's trade keyword). Picking
 * "Ice Cream Truck" over "Auntie Betty's Bakery" IS choosing what kind of
 * business this is — there's no separate type/archetype system to keep in
 * sync with the name, so this one control does both jobs asked for.
 *
 * Ported verbatim (aside from import paths) from VentureFlow's
 * src/components/StartBusinessModal.jsx — `onConfirm(name)` is wired by
 * ArenaGameBoard to `game.startBusiness(activePlayer.id, name)`, which
 * useOnlineGame submits as `{ type: 'START_BUSINESS', name }`, matching
 * the same `action.name` field the reducer already reads (see
 * game-engine/reducer.js's START_BUSINESS case).
 *
 * Leaving the text field blank and just tapping a suggestion (or Confirm
 * with nothing typed and nothing picked) still works — actions.js falls
 * back to its own random whimsical pick exactly as it always has, so
 * "I don't care, surprise me" costs zero extra taps.
 */
export default function StartBusinessModal({ existingNames = [], onConfirm, onCancel }) {
  const [suggestions, setSuggestions] = useState(() => sampleNames(BUSINESS_NAMES, existingNames, SUGGESTION_COUNT));
  const [selected, setSelected] = useState(suggestions[0] || '');
  const [customName, setCustomName] = useState('');

  const previewName = customName.trim() || selected;
  const preview = useMemo(() => businessArt(previewName), [previewName]);

  function reroll() {
    playSound('click');
    const next = sampleNames(BUSINESS_NAMES, existingNames, SUGGESTION_COUNT);
    setSuggestions(next);
    setSelected(next[0] || '');
  }

  function pick(name) {
    playSound('click');
    setSelected(name);
    setCustomName('');
  }

  function handleConfirm() {
    playSound('cashRegister');
    onConfirm(customName.trim() || selected);
  }

  return (
    <div className="vf-modal-overlay">
      <div className="vf-modal vf-modal--good vf-start-business-modal">
        <div className="vf-modal__icon">🚀</div>
        <div className="vf-modal__title">Name your business</div>
        <p className="vf-modal__flavor">
          Pick a suggestion below, or type your own — either way, ${BUSINESS_COST} and {BUSINESS_SKILL_COST} 💡 gets
          it started.
        </p>

        <div className="vf-start-business-modal__preview" style={{ background: `linear-gradient(135deg, ${preview.from}, ${preview.to})` }}>
          <span className="vf-start-business-modal__preview-hero">{preview.hero}</span>
          <span className="vf-start-business-modal__preview-name">{previewName || 'Your business'}</span>
          <span className="vf-start-business-modal__preview-props">
            {preview.props.map((p, i) => (
              <span key={i}>{p}</span>
            ))}
          </span>
        </div>

        <div className="vf-start-business-modal__suggestions">
          {suggestions.map((name) => {
            const art = businessArt(name);
            const isPicked = !customName.trim() && selected === name;
            return (
              <button
                key={name}
                type="button"
                className={`vf-start-business-modal__suggestion ${isPicked ? 'vf-start-business-modal__suggestion--picked' : ''}`}
                onClick={() => pick(name)}
              >
                <span className="vf-start-business-modal__suggestion-hero">{art.hero}</span>
                <span className="vf-start-business-modal__suggestion-name">{name}</span>
              </button>
            );
          })}
        </div>

        <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={reroll}>
          🎲 Show different ideas
        </button>

        <label className="vf-start-business-modal__custom-label" htmlFor="vf-custom-business-name">
          Or type your own
        </label>
        <input
          id="vf-custom-business-name"
          type="text"
          maxLength={40}
          className="vf-start-business-modal__custom-input"
          placeholder="e.g. Sam's Skateboard Repair"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
        />

        <div className="vf-modal__actions">
          <button type="button" className="vf-btn vf-btn--ghost vf-btn--lg" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="vf-btn vf-btn--primary vf-btn--lg" onClick={handleConfirm}>
            🚀 Start It Up
          </button>
        </div>
      </div>
    </div>
  );
}
