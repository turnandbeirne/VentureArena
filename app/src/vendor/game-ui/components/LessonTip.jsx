import { useState } from 'react';
import { FINANCIAL_LESSONS } from '../../data/gameConfig';
import { useTeachMode } from '../hooks/useTeachMode';
import { playSound } from '../audio/soundEngine';

/**
 * A small "❓" affordance that expands into the matching FINANCIAL_LESSONS
 * blurb (data/gameConfig.js) — the on-demand counterpart to
 * game-engine/lessons.js's one-time "first time this happens" callout in
 * the event log. Tap it any time "Teach Me" mode is on, as many times as
 * you like, on whichever significant game element it's attached to (see
 * hooks/useTeachMode.js). Ported verbatim (aside from import paths) from
 * VentureFlow's src/components/LessonTip.jsx.
 *
 * Renders nothing at all when Teach Me mode is off, so a player who hasn't
 * turned it on sees the board exactly as it's always looked — this is
 * purely additive UI, never a layout change for anyone who doesn't want it.
 *
 * Expands in normal document flow (not an absolutely-positioned popover) —
 * simpler, and avoids clipping inside any of the scrollable/rounded cards
 * it lives in.
 */
export default function LessonTip({ conceptId, className = '' }) {
  const { teachMode } = useTeachMode();
  const [open, setOpen] = useState(false);
  const lesson = FINANCIAL_LESSONS[conceptId];

  if (!teachMode || !lesson) return null;

  return (
    <span className={`vf-lesson-tip ${className}`}>
      <button
        type="button"
        className={`vf-lesson-tip__toggle ${open ? 'vf-lesson-tip__toggle--open' : ''}`}
        aria-expanded={open}
        aria-label={open ? `Hide the lesson about ${lesson.title}` : `Learn about ${lesson.title}`}
        onClick={(e) => {
          e.stopPropagation();
          playSound('click');
          setOpen((o) => !o);
        }}
      >
        {open ? '✕' : '❓'}
      </button>
      {open && (
        <span className="vf-lesson-tip__bubble">
          <strong>
            {lesson.icon} {lesson.title}
          </strong>
          <span>{lesson.blurb}</span>
        </span>
      )}
    </span>
  );
}
