// ============================================================================
// Fortune card decks
// ----------------------------------------------------------------------------
// Drawing is weighted by the current weather stage (see gameConfig
// WEATHER_STAGES[...].deckWeight). Applying a card's effect is generic over
// the small set of effect "type"s so new cards never need engine changes.
// ============================================================================
import { OPPORTUNITY_DECK, SETBACK_DECK, BUSINESS_DECLINE_INCOME_FLOOR } from '../data/gameConfig';
import { getAssetConfig } from './market';
// Environment stream — see game/rng.js's module comment. Which fortune
// card gets drawn is part of the shared Daily Challenge environment, not a
// player choice.
import { envWeightedPick as weightedPick, envPickRandom as pickRandom } from './rng';
import { getStageInfo } from './weather';
import { bumpPrice } from './market';

const DECKS = {
  opportunity: OPPORTUNITY_DECK,
  setback: SETBACK_DECK,
};

/** Draw a single fortune card, biased by the current weather stage. */
export function drawFortuneCard(weatherState) {
  const stage = getStageInfo(weatherState);
  const deckId = weightedPick(stage.deckWeight);
  const card = pickRandom(DECKS[deckId]);
  return { deckId, card };
}

/** The business a card should hit when it targets "your business" — the
 * player's most lucrative one, matching how game/businessExits.js picks a
 * buyout target. Uses PERMANENT income (`business.income`) rather than
 * this month's effective income, so a temporary Marketing campaign can't
 * change which business a card lands on. */
function primaryBusiness(player) {
  if (!player.businesses || player.businesses.length === 0) return null;
  return [...player.businesses].sort((a, b) => b.income - a.income)[0];
}

/**
 * Apply a card's effect(s) to a single player + the shared asset price
 * table. A card carries either a single legacy `effect` object or an
 * `effects` array (see gameConfig.js's OPPORTUNITY_DECK/SETBACK_DECK
 * comment) — both are normalized to an array here and applied in order.
 *
 * OWNERSHIP GATING: every effect that names an asset or a business is a
 * no-op for a player who doesn't hold it, and says so. Cards used to hand
 * out flat cash with asset flavour attached — "Tree House Tourists, +$50"
 * paid a player who had never bought a Tree House, which taught exactly the
 * wrong lesson (rewards come from what you own, not from what the card is
 * about). `month` is needed by the effects that schedule something into
 * future months (a paused business, a temporary allowance change).
 *
 * Returns { player, prices, description } — description is a short string
 * for the event log, and is never empty: a card that couldn't touch this
 * player reports why ("no Tree Houses owned — no effect").
 */
export function applyCardEffect(player, prices, card, month = null) {
  const effects = card.effects || (card.effect ? [card.effect] : []);
  let nextPlayer = { ...player };
  let nextPrices = prices;
  const descriptions = [];
  // Assets/businesses a card tried to touch but the player doesn't have —
  // used to write an honest "nothing happened, and here's why" line.
  const missed = [];

  for (const effect of effects) {
    switch (effect.type) {
      case 'cash': {
        nextPlayer.cash = Math.max(0, Math.round(nextPlayer.cash + effect.amount));
        descriptions.push(`${effect.amount >= 0 ? '+' : ''}$${effect.amount}`);
        break;
      }
      case 'cashPercent': {
        const delta = Math.round((nextPlayer.cash * effect.percent) / 100);
        nextPlayer.cash = Math.max(0, nextPlayer.cash + delta);
        descriptions.push(`${effect.percent >= 0 ? '+' : ''}${effect.percent}% cash`);
        break;
      }
      case 'assetPrice': {
        nextPrices = bumpPrice(nextPrices, effect.assetId, effect.percent);
        descriptions.push(
          `${effect.assetId === 'all' ? 'All assets' : effect.assetId} ${effect.percent >= 0 ? '+' : ''}${effect.percent}%`
        );
        break;
      }
      case 'skillToken': {
        nextPlayer.skillTokens = Math.max(0, nextPlayer.skillTokens + effect.amount);
        descriptions.push(`${effect.amount >= 0 ? '+' : ''}${effect.amount} skill token`);
        break;
      }
      case 'passiveBonus': {
        nextPlayer.passiveBonus = (nextPlayer.passiveBonus || 0) + effect.amount;
        descriptions.push(`${effect.amount >= 0 ? '+' : ''}$${effect.amount}/mo`);
        break;
      }
      case 'perUnitCash': {
        // A one-time cash bump/penalty scaled by how many units of an asset
        // the player OWNS right now (e.g. the 3 lemonade cards — more
        // stands you own, more the weather/review/spill actually costs or
        // earns you). Silent no-op — and no description line — for a
        // player who doesn't own any, so the event log doesn't clutter
        // everyone else's turn with a "+$0" they had no stake in.
        const qty = nextPlayer.holdings[effect.assetId] || 0;
        const assetName = getAssetConfig(effect.assetId)?.name || effect.assetId;
        if (qty > 0) {
          const amount = Math.round(qty * effect.amount);
          nextPlayer.cash = Math.max(0, Math.round(nextPlayer.cash + amount));
          descriptions.push(`${amount >= 0 ? '+' : ''}$${amount} from your ${qty} ${assetName}${qty === 1 ? '' : 's'}`);
        } else {
          missed.push(`no ${assetName}s owned`);
        }
        break;
      }

      case 'assetUnits': {
        // Lose (or gain) a PERCENTAGE OF THE UNITS held — a bank failure
        // taking a slice of your savings, not a price move. Distinct from
        // 'assetPrice' on purpose: this only ever touches the drawing
        // player, and it's a permanent loss of the thing itself rather than
        // a dip they could wait out.
        const qty = nextPlayer.holdings[effect.assetId] || 0;
        const assetName = getAssetConfig(effect.assetId)?.name || effect.assetId;
        if (qty > 0) {
          const raw = (qty * effect.percent) / 100;
          // Round AWAY from zero so a small holding still feels something —
          // 12% of 3 piggy banks has to cost one, not silently round to 0 —
          // while never taking more than the player actually has.
          const delta = raw < 0 ? -Math.min(qty, Math.ceil(-raw)) : Math.floor(raw);
          if (delta !== 0) {
            nextPlayer.holdings = { ...nextPlayer.holdings, [effect.assetId]: qty + delta };
            descriptions.push(`${delta > 0 ? '+' : ''}${delta} ${assetName}${Math.abs(delta) === 1 ? '' : 's'}`);
          } else {
            descriptions.push(`${assetName}s untouched this time`);
          }
        } else {
          missed.push(`no ${assetName}s owned`);
        }
        break;
      }

      case 'businessIncomePercent': {
        // A PERMANENT change to one business's base monthly revenue — a
        // partnership souring, a supplier contract, a big repeat client.
        // Applied to `income` (the permanent figure), never to temporary
        // Marketing boosts, and floored at BUSINESS_DECLINE_INCOME_FLOOR so
        // a bad card makes a business a poor asset, never a worthless one.
        const target = primaryBusiness(nextPlayer);
        if (target) {
          const delta = Math.round((target.income * effect.percent) / 100);
          const nextIncome = Math.max(BUSINESS_DECLINE_INCOME_FLOOR, target.income + delta);
          const actual = nextIncome - target.income;
          nextPlayer.businesses = nextPlayer.businesses.map((b) =>
            b.id === target.id ? { ...b, income: nextIncome } : b
          );
          descriptions.push(`${target.name}: ${actual >= 0 ? '+' : ''}$${actual}/mo permanently`);
        } else {
          missed.push('no business to affect');
        }
        break;
      }

      case 'businessPause': {
        // Every business this player owns earns nothing for the next
        // `months` paydays. Stored as the LAST month still affected, so the
        // check at payday is a plain comparison and a second pause card
        // extends rather than replaces (Math.max) instead of accidentally
        // shortening an existing one.
        if (!nextPlayer.businesses || nextPlayer.businesses.length === 0) {
          missed.push('no business to affect');
          break;
        }
        if (month == null) break;
        const until = month + (effect.months || 1);
        nextPlayer.businessPauseUntilMonth = Math.max(nextPlayer.businessPauseUntilMonth || 0, until);
        descriptions.push(
          `no business income for ${effect.months || 1} month${(effect.months || 1) === 1 ? '' : 's'}`
        );
        break;
      }

      case 'allowanceModifier': {
        // A temporary change to the monthly allowance — a lost side job, a
        // new shared cost. Kept as a list so two overlapping modifiers
        // stack rather than one silently replacing the other; expired ones
        // are pruned at payday (see game/turnEngine.js).
        if (month == null) break;
        const mod = { percent: effect.percent, expiresMonth: month + (effect.months || 1) };
        nextPlayer.allowanceMods = [...(nextPlayer.allowanceMods || []), mod];
        descriptions.push(
          `${effect.percent >= 0 ? '+' : ''}${effect.percent}% allowance for ${effect.months || 1} month${
            (effect.months || 1) === 1 ? '' : 's'
          }`
        );
        break;
      }
      default:
        break;
    }
  }

  // A card that found nothing to act on still needs to say something
  // truthful, or the log reads "Maya: Bank Failure ()" and the player is
  // left guessing whether it cost them.
  const description =
    descriptions.length > 0
      ? descriptions.join(', ')
      : missed.length > 0
      ? `${missed[0]} — no effect`
      : 'no effect';

  return { player: nextPlayer, prices: nextPrices, description };
}
