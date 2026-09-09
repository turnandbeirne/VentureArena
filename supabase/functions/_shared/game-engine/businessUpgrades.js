// ============================================================================
// Business upgrades — Marketing / Sales / Operations / R&D
// ----------------------------------------------------------------------------
// Pure logic for the four ways a player can keep investing in a business
// after starting it (see gameConfig.js's BUSINESS_UPGRADE_TRACKS for the
// costs/flavor and a one-line explanation of why each track behaves
// differently). Nothing here touches game state directly — actions.js's
// upgradeBusiness() calls into this to compute cost/effect, and
// turnEngine.js calls resolvePendingRnd() at month-end.
// ============================================================================
import {
  BUSINESS_UPGRADE_TRACKS,
  MARKETING_BOOST_PCT_MIN,
  MARKETING_BOOST_PCT_MAX,
  MARKETING_BOOST_MONTHS,
  SALES_BOOST_PCT_MIN,
  SALES_BOOST_PCT_MAX,
  SALES_MAX_LEVEL,
  OPS_DISCOUNT_PER_LEVEL,
  OPS_MAX_LEVEL,
  RND_DELAY_MONTHS,
  RND_MAX_PROJECTS,
  RND_BIG_PAYOFF_CHANCE,
  RND_SMALL_PAYOFF_PCT_MIN,
  RND_SMALL_PAYOFF_PCT_MAX,
  RND_BIG_PAYOFF_PCT_MIN,
  RND_BIG_PAYOFF_PCT_MAX,
  BUSINESS_DECLINE_GRACE_MONTHS,
  BUSINESS_DECLINE_WARNING_MONTHS,
  BUSINESS_DECLINE_INTERVAL_MONTHS,
  BUSINESS_DECLINE_PCT_MIN,
  BUSINESS_DECLINE_PCT_MAX,
  BUSINESS_DECLINE_INCOME_FLOOR,
  MARKETING_CAMPAIGNS_PER_UPGRADE,
  MARKETING_FREE_CAMPAIGNS,
  MARKETING_UPKEEP_CAMPAIGNS_PER_MONTH,
} from '../data/gameConfig';
import { chance, randomFloat } from './rng';

/** A random $ amount that's `pctMin`-`pctMax` of `income`, rounded to a
 * whole dollar — the shared building block behind Marketing, Sales, and
 * R&D's payouts (see the module comment above and gameConfig.js's
 * BUSINESS_UPGRADE_TRACKS comment for why this replaced flat $ amounts).
 * Drawn from the DEFAULT rng stream (player-choice-driven — buying an
 * upgrade is a choice — not the environment stream; see rng.js's module
 * comment). Never rounds to $0 as long as `income` is at least
 * BUSINESS_INCOME_MIN and pctMin stays at its current 0.08 floor. */
function percentOfIncome(income, pctMin, pctMax) {
  const pct = randomFloat(pctMin, pctMax);
  return { amount: Math.round(income * pct), pct };
}

const MAX_OPS_DISCOUNT = 0.9;

/**
 * What buying one more level of `trackId` would currently cost THIS
 * business, after its own Operations discount — Operations makes every
 * OTHER track cheaper for the business it was bought on, but never
 * discounts itself (otherwise it'd be strictly better than every other
 * track, which defeats the point of four distinct choices).
 */
export function upgradeCost(business, trackId) {
  const base = BUSINESS_UPGRADE_TRACKS[trackId]?.cost ?? 0;
  if (trackId === 'ops') return base;
  const discount = Math.min(MAX_OPS_DISCOUNT, (business.opsLevel || 0) * OPS_DISCOUNT_PER_LEVEL);
  return Math.round(base * (1 - discount));
}

/**
 * How many non-Marketing upgrades have been bought for this business — one
 * per Sales level, one per Ops level, one per R&D project. This is what
 * earns Marketing headroom (see marketingAllowance below).
 */
export function otherUpgradeCount(business) {
  return (business.salesLevel || 0) + (business.opsLevel || 0) + (business.rndCount || 0);
}

/**
 * How many Marketing campaigns this business has ever launched. Counts
 * campaigns BOUGHT, not campaigns still running — an expired campaign does
 * NOT free up room (see gameConfig.js's MARKETING_CAMPAIGNS_PER_UPGRADE
 * comment for why that matters). Falls back to the number of recorded
 * boosts for a business saved before this counter existed, which is the
 * closest honest reading of its history available.
 */
export function marketingCampaignsUsed(business) {
  return business.marketingCount ?? (business.tempBoosts || []).length;
}

/**
 * The total number of Marketing campaigns this business is allowed to
 * launch, ever: MARKETING_FREE_CAMPAIGNS to start with, then
 * MARKETING_CAMPAIGNS_PER_UPGRADE for every non-Marketing upgrade bought
 * for it. 0 other upgrades -> 2 campaigns; 3 -> 6; 6 -> 12.
 */
export function marketingAllowance(business) {
  return Math.max(MARKETING_FREE_CAMPAIGNS, MARKETING_CAMPAIGNS_PER_UPGRADE * otherUpgradeCount(business));
}

/** How many more Marketing campaigns this business can still launch right
 * now (never negative — an old save that already overshot the new cap is
 * simply frozen out of more campaigns rather than being retroactively
 * punished). */
export function marketingRemaining(business) {
  return Math.max(0, marketingAllowance(business) - marketingCampaignsUsed(business));
}

/**
 * How many upkeep campaigns this business has already run in `month` — the
 * always-available maintenance purchase that exists so a fully-built
 * business can never become impossible to tend (see gameConfig.js's
 * MARKETING_UPKEEP_CAMPAIGNS_PER_MONTH comment). Tracked separately from
 * `marketingCount` precisely so it never eats earned allowance.
 */
export function marketingUpkeepUsedThisMonth(business, month) {
  if (month == null) return 0;
  return business.lastMarketingUpkeepMonth === month ? MARKETING_UPKEEP_CAMPAIGNS_PER_MONTH : 0;
}

/**
 * Whether an upkeep campaign is available for this business right now: only
 * once the earned allowance is spent (while there's allowance left, a
 * campaign is just a normal campaign and spends it), and only if this
 * month's upkeep hasn't been used yet.
 *
 * `month == null` — a caller with no month context, e.g. the read-only
 * portfolio view opened from the game-over screen — always reads as
 * unavailable rather than guessing, so nothing can be bought off a stale
 * assumption about what month it is.
 */
export function marketingUpkeepAvailable(business, month) {
  if (month == null) return false;
  if (marketingRemaining(business) > 0) return false;
  return marketingUpkeepUsedThisMonth(business, month) < MARKETING_UPKEEP_CAMPAIGNS_PER_MONTH;
}

/**
 * Whether `trackId` has more room to grow for this business. Sales and
 * Operations cap out at a few levels each (steady, bounded climbs, so
 * income can't spiral); R&D caps at a couple of projects (each is a slow,
 * meaningful bet, not something to spam); Marketing caps RELATIVE to how
 * much real building has been done on this business — see
 * marketingAllowance above and gameConfig.js's MARKETING_CAMPAIGNS_PER_UPGRADE
 * comment for the buyout exploit this closes — with the one deliberate
 * exception of the monthly upkeep campaign above.
 *
 * `month` is optional and only matters for Marketing (it's what decides
 * whether this month's upkeep is still available). Omitting it enforces the
 * strict allowance, which is the safe reading for any caller that doesn't
 * know what month it is. game/aiEngine.js builds its upgrade candidates
 * through this same function, so robots are held to identical limits,
 * upkeep included.
 */
export function canUpgradeTrack(business, trackId, month = null) {
  if (trackId === 'sales') return (business.salesLevel || 0) < SALES_MAX_LEVEL;
  if (trackId === 'ops') return (business.opsLevel || 0) < OPS_MAX_LEVEL;
  if (trackId === 'rnd') return (business.rndCount || 0) < RND_MAX_PROJECTS;
  if (trackId === 'marketing') return marketingRemaining(business) > 0 || marketingUpkeepAvailable(business, month);
  return false;
}

/**
 * How many more non-Marketing upgrades this business needs before its
 * campaign allowance actually rises above what it has already spent.
 *
 * Usually 1 — but not always, and the exception is worth being precise
 * about rather than hand-waving: because the allowance is
 * `max(FREE, PER_UPGRADE x other)` rather than `FREE + PER_UPGRADE x
 * other`, the starting campaigns are the same 2 that the first upgrade
 * would have earned. So a brand-new business that has burned both of its
 * free campaigns needs TWO other upgrades to unlock the next one, not one.
 * Telling a player "buy one upgrade" there would be a lie they'd discover
 * by spending $150.
 */
export function upgradesNeededForNextCampaign(business) {
  if (marketingRemaining(business) > 0) return 0;
  const used = marketingCampaignsUsed(business);
  const other = otherUpgradeCount(business);
  let needed = 1;
  while (MARKETING_CAMPAIGNS_PER_UPGRADE * (other + needed) <= used) needed += 1;
  return needed;
}

/**
 * A player-facing explanation of why `trackId` can't be bought for this
 * business right now, or null if it can. Marketing gets its own wording
 * because "maxed out" is misleading for a cap that buying a different
 * track will lift.
 */
export function upgradeBlockReason(business, trackId, month = null) {
  if (canUpgradeTrack(business, trackId, month)) return null;
  if (trackId === 'marketing') {
    const needed = upgradesNeededForNextCampaign(business);
    const unlock = `Buy ${needed} more Sales, Operations, or R&D upgrade${needed === 1 ? '' : 's'} to unlock more`;
    // If the only reason it's blocked is that this month's upkeep campaign
    // is already spent, say THAT — "all your campaigns are gone" would read
    // as permanent when another one arrives next month.
    if (month != null && marketingUpkeepUsedThisMonth(business, month) > 0) {
      return `${business.name} has already run its upkeep campaign this month. ${unlock}, or run another next month.`;
    }
    return `${business.name} has used all ${marketingAllowance(business)} of its Marketing campaigns. ${unlock}.`;
  }
  return null;
}

/**
 * Sum of every currently-active Marketing boost on a business for a given
 * month — this is what game/players.js's businessMonthlyIncome() (and so
 * passiveIncome()/payday) actually reads.
 */
export function activeMarketingBoostTotal(business, month) {
  if (month == null) return 0;
  return (business.tempBoosts || []).reduce((sum, b) => (month <= b.expiresMonth ? sum + b.amount : sum), 0);
}

/**
 * Apply one purchase of `trackId` to a business, returning the updated
 * business object, the cash actually spent (net of the Operations
 * discount), and a short log-friendly description. `currentMonth` is
 * whatever month is currently in play (state.month at the moment of
 * purchase) — Marketing's boost window and R&D's delayed resolution are
 * both anchored to it.
 *
 * Marketing and R&D don't change `income` immediately: Marketing adds a
 * time-boxed boost that businessMonthlyIncome() picks up on its own and
 * that expires on its own; R&D just queues a delayed resolution (see
 * resolvePendingRnd below) — the cash is spent now, but the payoff, big or
 * small but never nothing, lands a couple of months later. That delay is
 * the point: R&D is a slower, less certain bet than Sales.
 */
export function applyUpgrade(business, trackId, currentMonth) {
  const cost = upgradeCost(business, trackId);
  const totalInvested = (business.totalInvested || 0) + cost;
  // Buying ANY upgrade — even just one Marketing campaign — counts as
  // "tending" the business and resets the business-decline clock (see
  // applyBusinessDecline below and gameConfig.js's BUSINESS_DECLINE_*
  // comment). Deliberately stamped at PURCHASE time, not later — an R&D
  // project's eventual payoff (resolvePendingRnd, which runs automatically
  // at month-end with no further player action) does NOT re-stamp it;
  // only an actual decision to invest does.
  const lastTendedMonth = currentMonth;

  if (trackId === 'marketing') {
    // % of the business's current PERMANENT income (business.income) —
    // deliberately NOT including any other still-active Marketing boost,
    // so stacking campaigns can't inflate each other's roll.
    const { amount, pct } = percentOfIncome(business.income, MARKETING_BOOST_PCT_MIN, MARKETING_BOOST_PCT_MAX);
    const boost = { amount, expiresMonth: currentMonth + MARKETING_BOOST_MONTHS - 1 };
    // Which kind of campaign this is decides what gets stamped. A normal
    // campaign spends earned allowance and bumps `marketingCount` (a
    // lifetime counter, deliberately never decremented when a boost expires
    // — it's what marketingAllowance is measured against). An upkeep
    // campaign — only reachable once the allowance is gone, once a month —
    // stamps `lastMarketingUpkeepMonth` instead and leaves the allowance
    // untouched, so it can never eat headroom the player earned.
    const isUpkeep = marketingRemaining(business) <= 0;
    const nextBusiness = {
      ...business,
      totalInvested,
      lastTendedMonth,
      tempBoosts: [...(business.tempBoosts || []), boost],
      ...(isUpkeep
        ? { lastMarketingUpkeepMonth: currentMonth }
        : { marketingCount: marketingCampaignsUsed(business) + 1 }),
    };
    const left = marketingRemaining(nextBusiness);
    const tail = isUpkeep
      ? 'an upkeep campaign — keeps it tended'
      : `${left} campaign${left === 1 ? '' : 's'} left`;
    return {
      business: nextBusiness,
      cost,
      description: `ran a Marketing campaign for ${business.name} (+$${amount}/mo, ${Math.round(pct * 100)}% of revenue, for ${MARKETING_BOOST_MONTHS} months) — ${tail}`,
    };
  }
  if (trackId === 'sales') {
    // % of current income too, but PERMANENT — and since it's a % of
    // whatever income already includes (prior Sales bumps, R&D payoffs),
    // each successive Sales purchase compounds on a bigger base.
    const { amount, pct } = percentOfIncome(business.income, SALES_BOOST_PCT_MIN, SALES_BOOST_PCT_MAX);
    return {
      business: {
        ...business,
        totalInvested,
        lastTendedMonth,
        salesLevel: (business.salesLevel || 0) + 1,
        income: business.income + amount,
      },
      cost,
      description: `grew Sales at ${business.name} (+$${amount}/mo, ${Math.round(pct * 100)}% increase, permanent)`,
    };
  }
  if (trackId === 'ops') {
    return {
      business: { ...business, totalInvested, lastTendedMonth, opsLevel: (business.opsLevel || 0) + 1 },
      cost,
      description: `streamlined Operations at ${business.name} (future upgrades here cost less)`,
    };
  }
  if (trackId === 'rnd') {
    const resolveMonth = currentMonth + RND_DELAY_MONTHS;
    return {
      business: {
        ...business,
        totalInvested,
        lastTendedMonth,
        rndCount: (business.rndCount || 0) + 1,
        pendingRnd: [...(business.pendingRnd || []), { resolveMonth }],
      },
      cost,
      description: `started an R&D project at ${business.name} (result in ${RND_DELAY_MONTHS} months)`,
    };
  }
  return { business, cost: 0, description: '' };
}

/**
 * Roll and apply every R&D project on `business` whose delay is up as of
 * `month`, returning the updated business plus one result per project that
 * resolved ({ big, amount, pct }). There's always SOME payoff — see
 * RND_BIG_PAYOFF_CHANCE — meant to feel like a risk worth taking, not a
 * trap. Like Marketing/Sales, the payoff is now a % of the business's
 * current income rather than a flat $ figure (see percentOfIncome above);
 * a big payoff draws from a distinctly higher sub-range than a small one
 * so "big" always actually reads as bigger. No-ops (same business back,
 * empty results) if nothing's due yet. If multiple projects resolve in the
 * same call, each one's % is computed against the RUNNING (already-bumped)
 * income, so they compound within the same month too.
 */
export function resolvePendingRnd(business, month) {
  const pending = business.pendingRnd || [];
  const due = pending.filter((p) => p.resolveMonth <= month);
  if (due.length === 0) return { business, results: [] };

  const remaining = pending.filter((p) => p.resolveMonth > month);
  let income = business.income;
  const results = [];
  for (let i = 0; i < due.length; i++) {
    const big = chance(RND_BIG_PAYOFF_CHANCE);
    const { amount, pct } = big
      ? percentOfIncome(income, RND_BIG_PAYOFF_PCT_MIN, RND_BIG_PAYOFF_PCT_MAX)
      : percentOfIncome(income, RND_SMALL_PAYOFF_PCT_MIN, RND_SMALL_PAYOFF_PCT_MAX);
    income += amount;
    results.push({ big, amount, pct });
  }
  return { business: { ...business, income, pendingRnd: remaining }, results };
}

/** Drop any Marketing boosts that have already expired as of `month` — keeps
 * a business's tempBoosts array from growing forever with dead entries.
 * Purely tidying; activeMarketingBoostTotal() already ignores expired ones
 * even without this. */
export function pruneExpiredBoosts(business, month) {
  const tempBoosts = (business.tempBoosts || []).filter((b) => b.expiresMonth >= month);
  if (tempBoosts.length === (business.tempBoosts || []).length) return business;
  return { ...business, tempBoosts };
}

/** How many months it's been since `business` was last purchased an
 * upgrade for (or started, if never upgraded) — the shared basis for both
 * the decline decay below and the UI's health-status coloring. Falls back
 * to `month` itself (i.e. "just tended") for a business saved before either
 * field existed, so an old save doesn't suddenly show as neglected. */
function monthsSinceTended(business, month) {
  const lastTended = business.lastTendedMonth ?? business.startedMonth ?? month;
  return Math.max(0, month - lastTended);
}

/**
 * A business's neglect status for the current month — purely a read, no
 * mutation — for the UI (PlayerDetailModal.jsx) to color a business's name:
 * 'healthy' (nothing to worry about), 'warning' (within
 * BUSINESS_DECLINE_WARNING_MONTHS of decline actually starting — the
 * "yellow name" state), or 'declining' (past the grace period and actively
 * losing income — the "red name" state). `month == null` (context not
 * available) always reads as healthy rather than guessing.
 */
export function businessHealthStatus(business, month) {
  if (month == null) return 'healthy';
  const months = monthsSinceTended(business, month);
  if (months >= BUSINESS_DECLINE_GRACE_MONTHS) return 'declining';
  if (months >= BUSINESS_DECLINE_GRACE_MONTHS - BUSINESS_DECLINE_WARNING_MONTHS) return 'warning';
  return 'healthy';
}

/**
 * Apply one month's worth of neglect decay to `business`, if it's due.
 * Nothing happens until BUSINESS_DECLINE_GRACE_MONTHS have passed with no
 * upgrade purchase (see applyUpgrade's lastTendedMonth stamp above); after
 * that, income takes a random 5%-10% hit every
 * BUSINESS_DECLINE_INTERVAL_MONTHS months — a slow fade, not a monthly
 * cliff, and floored at BUSINESS_DECLINE_INCOME_FLOOR so a neglected
 * business becomes a bad deal, never a worthless one. Rolled on the
 * DEFAULT rng stream, like every other upgrade-adjacent roll (see
 * percentOfIncome above) — whether this fires at all is a direct
 * consequence of the player's own choice not to reinvest, so (unlike
 * weather/cards/business-exits) there's no Daily-Challenge-fairness reason
 * to route it through the environment stream instead; see rng.js's module
 * comment and businessExits.js's for the distinction this is following.
 * Returns `{ business, declined, loss }` — `declined`/`loss` are only
 * meaningful when true/set; the business is returned unchanged (same
 * reference) when nothing happened this month.
 */
export function applyBusinessDecline(business, month) {
  const months = monthsSinceTended(business, month);
  if (months < BUSINESS_DECLINE_GRACE_MONTHS) return { business, declined: false };

  const monthsIntoDecline = months - BUSINESS_DECLINE_GRACE_MONTHS;
  if (monthsIntoDecline % BUSINESS_DECLINE_INTERVAL_MONTHS !== 0) return { business, declined: false };
  if (business.income <= BUSINESS_DECLINE_INCOME_FLOOR) return { business, declined: false };

  const pct = randomFloat(BUSINESS_DECLINE_PCT_MIN, BUSINESS_DECLINE_PCT_MAX);
  const rawLoss = Math.max(1, Math.round(business.income * pct));
  const nextIncome = Math.max(BUSINESS_DECLINE_INCOME_FLOOR, business.income - rawLoss);
  const loss = business.income - nextIncome;
  if (loss <= 0) return { business, declined: false };

  return { business: { ...business, income: nextIncome }, declined: true, loss };
}
