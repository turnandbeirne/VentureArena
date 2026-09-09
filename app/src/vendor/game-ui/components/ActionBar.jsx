import { useCallback } from 'react';
import { BUSINESS_COST, BUSINESS_SKILL_COST, SKILL_COST } from '../../data/gameConfig';
import { useHoldRepeat } from '../hooks/useHoldRepeat';
import LessonTip from './LessonTip';

export default function ActionBar({ player, disabled, onStartBusiness, onLearnSkill, onDone }) {
  const canStartBusiness = !disabled && player.cash >= BUSINESS_COST && player.skillTokens >= BUSINESS_SKILL_COST;
  const canLearnSkill = !disabled && player.cash >= SKILL_COST;

  // Skills are a plain repeatable purchase, so they get the same
  // press-and-hold-to-repeat treatment as the asset shop and the business
  // upgrade buttons — stocking up on three tokens is one press.
  //
  // Starting a business deliberately does NOT: it opens a full-screen
  // launch celebration for the new company (components/StartupLaunchModal),
  // and auto-repeating that would stack popups the player never asked for.
  // It stays a single, deliberate tap.
  const canLearnSkillRef = useCallback(() => canLearnSkill, [canLearnSkill]);
  const skillHold = useHoldRepeat(onLearnSkill, canLearnSkillRef);

  return (
    <div>
      <div className="vf-action-bar">
        <span className="vf-action-bar__item">
          <button type="button" className="vf-btn vf-btn--warm" disabled={!canStartBusiness} onClick={onStartBusiness}>
            🚀 Start Business (${BUSINESS_COST} + {BUSINESS_SKILL_COST} 💡)
          </button>
          <LessonTip conceptId="businessValuation" />
        </span>
        <span className="vf-action-bar__item">
          <button type="button" className="vf-btn vf-btn--warm" disabled={!canLearnSkill} {...skillHold}>
            📚 Learn Skill (${SKILL_COST})
          </button>
          <LessonTip conceptId="investInYourself" />
        </span>
      </div>
      <div className="vf-done-row" style={{ marginTop: '0.75rem' }}>
        <button type="button" className="vf-btn vf-btn--primary vf-btn--lg" disabled={disabled} onClick={onDone}>
          Done! Roll the weather 🎲
        </button>
      </div>
    </div>
  );
}
