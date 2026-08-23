// ============================================================================
// Fortune card decks
// ----------------------------------------------------------------------------
// Drawing is weighted by the current weather stage (see gameConfig
// WEATHER_STAGES[...].deckWeight). Applying a card's effect is generic over
// the small set of effect "type"s so new cards never need engine changes.
// ============================================================================
import { OPPORTUNITY_DECK, SETBACK_DECK } from '../data/gameConfig';
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

/**
 * Apply a card's effect(s) to a single player + the shared asset price
 * table. A card carries either a single legacy `effect` object or an
 * `effects` array (see gameConfig.js's OPPORTUNITY_DECK/SETBACK_DECK
 * comment) — both are normalized to an array here and applied in order, so
 * a card with just one effect behaves byte-for-byte like before. Returns
 * { player, prices, description } — description is a short string for the
 * event log (e.g. "+$40" or, for a multi-effect card, "lemonade +12%, +$10
 * stand income").
 */
export function applyCardEffect(player, prices, card) {
  const effects = card.effects || (card.effect ? [card.effect] : []);
  let nextPlayer = { ...player };
  let nextPrices = prices;
  const descriptions = [];

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
        if (qty > 0) {
          const amount = Math.round(qty * effect.amount);
          nextPlayer.cash = Math.max(0, Math.round(nextPlayer.cash + amount));
          descriptions.push(`${amount >= 0 ? '+' : ''}$${amount} stand income`);
        }
        break;
      }
      default:
        break;
    }
  }

  return { player: nextPlayer, prices: nextPrices, description: descriptions.join(', ') };
}
