// ============================================================================
// The in-game rulebook
// ----------------------------------------------------------------------------
// One place a player can look up how ANY part of VentureFlow works, without
// leaving the game — opened from the 📖 button next to the leaderboard on
// the board (components/RulebookModal.jsx) and from the setup screen.
//
// Every number in here is READ FROM gameConfig.js rather than typed out, so
// the rulebook can't drift out of sync with the rules it's describing: retune
// a constant and the rulebook re-renders with the new value on the next
// build. That's the whole reason this is a builder function over live config
// instead of a static markdown file.
//
// buildRulebook() takes the CURRENT game's difficulty/scenario (or nothing,
// on the setup screen) so the money figures shown are the ones actually in
// play, not the defaults.
// ============================================================================
import {
  GAME_LENGTH_MONTHS,
  DIFFICULTIES,
  SCENARIOS,
  getDifficulty,
  getScenario,
  DEFAULT_DIFFICULTY_ID,
  DEFAULT_SCENARIO_ID,
  SKILL_COST,
  BUSINESS_COST,
  BUSINESS_SKILL_COST,
  BUSINESS_INCOME_MIN,
  BUSINESS_INCOME_MAX,
  ASSETS,
  WEATHER_ORDER,
  WEATHER_STAGES,
  BADGES,
  BUSINESS_UPGRADE_TRACKS,
  MARKETING_BOOST_PCT_MIN,
  MARKETING_BOOST_PCT_MAX,
  MARKETING_BOOST_MONTHS,
  MARKETING_CAMPAIGNS_PER_UPGRADE,
  MARKETING_FREE_CAMPAIGNS,
  MARKETING_UPKEEP_CAMPAIGNS_PER_MONTH,
  SALES_BOOST_PCT_MIN,
  SALES_BOOST_PCT_MAX,
  SALES_MAX_LEVEL,
  OPS_DISCOUNT_PER_LEVEL,
  OPS_MAX_LEVEL,
  RND_DELAY_MONTHS,
  RND_MAX_PROJECTS,
  RND_BIG_PAYOFF_CHANCE,
  BUSINESS_DECLINE_GRACE_MONTHS,
  BUSINESS_DECLINE_PCT_MIN,
  BUSINESS_DECLINE_PCT_MAX,
  BUSINESS_DECLINE_INTERVAL_MONTHS,
  BUSINESS_EXIT_MULTIPLIER_WEIGHTS,
  BUSINESS_EXIT_RARITY_LABELS,
  BUSINESS_EXIT_CHANCE_PER_MONTH,
  RENT_OVERSUPPLY_FREE_UNITS,
  PIGGY_INTEREST_PCT_MIN,
  PIGGY_INTEREST_PCT_MAX,
  PIGGY_BONUS_PCT_MIN,
  PIGGY_BONUS_PCT_MAX,
  PIGGY_BONUS_CHANCE,
  getAssetIncomeRange,
  MAX_PLAYERS,
  SAME_TURN_SELL_PENALTY,
  WEATHER_SEVERITIES,
  TURN_TIME_SECONDS,
  TURN_EXTENSION_SECONDS,
  TURN_EXTENSIONS_PER_PLAYER,
  getWeatherSeverity,
  severityScaled,
} from '../../data/gameConfig';

const pct = (n) => `${+(n * 100).toFixed(2)}%`;
const money = (n) => `$${Math.round(n).toLocaleString()}`;

/**
 * The whole rulebook as `[{ id, icon, title, blocks }]`, where each block is
 * either `{ type: 'p', text }` (a paragraph), `{ type: 'list', items }` (a
 * bulleted list), or `{ type: 'rows', rows: [{ label, detail }] }` (a small
 * two-column reference table). Keeping it as data rather than JSX means the
 * modal can render it, search it, and print it without any of that logic
 * knowing what the rules actually say.
 */
export function buildRulebook({ difficultyId, scenarioId, weatherSeverityId, turnTimer } = {}) {
  const difficulty = getDifficulty(difficultyId || DEFAULT_DIFFICULTY_ID);
  const scenario = getScenario(scenarioId || DEFAULT_SCENARIO_ID);
  const severity = getWeatherSeverity(weatherSeverityId);

  return [
    {
      id: 'goal',
      icon: '🎯',
      title: 'The goal',
      blocks: [
        {
          type: 'p',
          text: `VentureFlow runs for ${GAME_LENGTH_MONTHS} months. Whoever has the highest NET WORTH when the last month ends, wins.`,
        },
        {
          type: 'p',
          text: 'Net worth = the cash in your pocket + what everything you own is worth right now + everything you have invested into your businesses. Cash sitting still does nothing; the game is about turning cash into things that earn.',
        },
        {
          type: 'p',
          text: `You are playing "${scenario.icon} ${scenario.name}" on ${difficulty.icon} ${difficulty.name} — starting cash ${money(
            difficulty.startingCash
          )}, allowance ${money(difficulty.monthlyAllowance)} a month, ${difficulty.startingSkillTokens} starting skill token${
            difficulty.startingSkillTokens === 1 ? '' : 's'
          }.`,
        },
        {
          type: 'rows',
          rows: SCENARIOS.map((s) => ({ label: `${s.icon} ${s.name}`, detail: s.tagline })),
        },
      ],
    },
    {
      id: 'turn',
      icon: '🔄',
      title: 'How a turn works',
      blocks: [
        {
          type: 'list',
          items: [
            'On your turn you can do as much as you can afford: buy things, sell things, learn a skill, start a business, and reinvest in businesses you already own. There is no limit on the number of actions — only on your cash.',
            'Press "Done!" to pass. Once every player has gone, the month wraps up.',
            'Month-end, in order: R&D projects that are due pay off, neglected businesses lose a little income, a buyout offer may appear, everyone gets paid, everyone draws a fortune card, prices drift, badges are awarded, and the weather may change.',
            'Tap any player card at any time to see their full portfolio — yours has the investment buttons on it, everyone else’s is read-only.',
            'A spotlight follows whoever’s turn it is. Robots take one move at a time, at whatever pace the speed slider is set to — drag it left to watch every move land, right to speed through. You can change it mid-game.',
            `A table seats up to ${MAX_PLAYERS} players — you against up to ${MAX_PLAYERS - 1} robots, or up to ${MAX_PLAYERS} humans passing one device.`,
            turnTimer
              ? `This game is on a clock: ${TURN_TIME_SECONDS} seconds a turn. You can add ${TURN_EXTENSION_SECONDS} more seconds up to ${TURN_EXTENSIONS_PER_PLAYER} times across the whole game. If time runs out your turn simply passes — nothing you already bought is taken away.`
              : `Games can optionally be played on a clock (${TURN_TIME_SECONDS} seconds a turn, with ${TURN_EXTENSIONS_PER_PLAYER} extensions each). This one isn't — turn it on at setup if you want it.`,
          ],
        },
      ],
    },
    {
      id: 'money',
      icon: '💰',
      title: 'Where money comes from',
      blocks: [
        {
          type: 'rows',
          rows: [
            { label: '💵 Allowance', detail: `${money(difficulty.monthlyAllowance)} every month, no matter what. This is the only money you get for free.` },
            { label: '🚀 Business income', detail: 'Every business you own pays its monthly income, every month.' },
            { label: '🏠 Rent & interest', detail: 'Some things you buy pay you every month just for owning them — see "What you can buy" below.' },
            { label: '🎴 Fortune cards', detail: 'One card per player per month. Some hand you cash, some cost you cash, some move prices.' },
            { label: '💼 Buyouts', detail: 'A buyer may offer to buy one of your businesses outright — a big one-time payday.' },
          ],
        },
      ],
    },
    {
      id: 'assets',
      icon: '🛒',
      title: 'What you can buy',
      blocks: [
        {
          type: 'p',
          text: 'Prices move every month with the weather plus a random wobble of their own. Riskier things swing harder — both up and down. Hold the Buy or Sell button to buy or sell a whole stack quickly.',
        },
        {
          type: 'p',
          text: `One catch: anything you sell in the SAME turn you bought it returns ${Math.round(
            SAME_TURN_SELL_PENALTY * 100
          )}% less. Prices only move at month-end, so buying and instantly selling would otherwise cost nothing — and in the real world you never get back quite what you just paid. Units you have held since an earlier month always sell at full price.`,
        },
        {
          type: 'rows',
          rows: ASSETS.map((asset) => {
            const range = getAssetIncomeRange(asset);
            let income;
            if (asset.rentPerMonth > 0) {
              income = `pays rent every month (it scales with the price, and drops a bit once the whole table owns more than ${RENT_OVERSUPPLY_FREE_UNITS} between them)`;
            } else if (range) {
              income = `pays ${money(range[0])}–${money(range[1])} a month per unit, rerolled each month based on the weather`;
            } else if (asset.interestBearing) {
              income = `pays ${pct(PIGGY_INTEREST_PCT_MIN)}–${pct(PIGGY_INTEREST_PCT_MAX)} of its value as interest every month, with roughly a ${pct(
                PIGGY_BONUS_CHANCE
              )} chance of a better month at ${pct(PIGGY_BONUS_PCT_MIN)}–${pct(PIGGY_BONUS_PCT_MAX)}`;
            } else {
              income = 'pays nothing monthly — you only make money if its price goes up';
            }
            return {
              label: `${asset.icon} ${asset.name}`,
              detail: `${asset.riskLabel}. Starts around ${money(asset.basePrice)}. It ${income}.`,
            };
          }),
        },
      ],
    },
    {
      id: 'business',
      icon: '🚀',
      title: 'Starting a business',
      blocks: [
        {
          type: 'p',
          text: `A business costs ${money(BUSINESS_COST)} plus ${BUSINESS_SKILL_COST} skill token${
            BUSINESS_SKILL_COST === 1 ? '' : 's'
          }, and pays ${money(BUSINESS_INCOME_MIN)}–${money(BUSINESS_INCOME_MAX)} a month from then on. A skill token costs ${money(
            SKILL_COST
          )} — so learn first, then build.`,
        },
        {
          type: 'p',
          text: 'A business is the strongest thing in the game: it pays every month forever, it can be grown with the four investment tracks below, and it can be sold to a buyer for a multiple of its yearly revenue.',
        },
      ],
    },
    {
      id: 'upgrades',
      icon: '⚙️',
      title: 'Growing a business',
      blocks: [
        {
          type: 'p',
          text: 'Open your own player card on your turn to invest in any business you own. Four tracks, each doing a genuinely different job:',
        },
        {
          type: 'rows',
          rows: [
            {
              label: `${BUSINESS_UPGRADE_TRACKS.marketing.icon} Marketing — ${money(BUSINESS_UPGRADE_TRACKS.marketing.cost)}`,
              detail: `A ${pct(MARKETING_BOOST_PCT_MIN)}–${pct(
                MARKETING_BOOST_PCT_MAX
              )} revenue bump that lasts ${MARKETING_BOOST_MONTHS} months and then fades. LIMITED: a business can run ${MARKETING_CAMPAIGNS_PER_UPGRADE} campaigns for every Sales, Operations, or R&D upgrade it has (minimum ${MARKETING_FREE_CAMPAIGNS}, so a brand-new business can still advertise) — 6 other upgrades = 12 campaigns. Ads alone don't build a company. On top of that, every business can always run ${MARKETING_UPKEEP_CAMPAIGNS_PER_MONTH} upkeep campaign a month, so it can never become impossible to look after.`,
            },
            {
              label: `${BUSINESS_UPGRADE_TRACKS.sales.icon} Sales — ${money(BUSINESS_UPGRADE_TRACKS.sales.cost)}`,
              detail: `A ${pct(SALES_BOOST_PCT_MIN)}–${pct(
                SALES_BOOST_PCT_MAX
              )} revenue bump that is PERMANENT. Up to ${SALES_MAX_LEVEL} levels per business.`,
            },
            {
              label: `${BUSINESS_UPGRADE_TRACKS.ops.icon} Operations — ${money(BUSINESS_UPGRADE_TRACKS.ops.cost)}`,
              detail: `Makes every other upgrade on that business ${pct(
                OPS_DISCOUNT_PER_LEVEL
              )} cheaper per level, up to ${OPS_MAX_LEVEL} levels. It never discounts itself.`,
            },
            {
              label: `${BUSINESS_UPGRADE_TRACKS.rnd.icon} R&D — ${money(BUSINESS_UPGRADE_TRACKS.rnd.cost)}`,
              detail: `Pay now, find out in ${RND_DELAY_MONTHS} months. Always pays SOMETHING permanent, and about ${pct(
                RND_BIG_PAYOFF_CHANCE
              )} of the time it's a big breakthrough. Up to ${RND_MAX_PROJECTS} projects per business.`,
            },
          ],
        },
        {
          type: 'p',
          text: `Every payoff is a percentage of that business's CURRENT income, so the same purchase is worth more on a business you've already grown. That's compounding — and it's why reinvesting early matters.`,
        },
      ],
    },
    {
      id: 'neglect',
      icon: '📉',
      title: 'Neglect and decline',
      blocks: [
        {
          type: 'p',
          text: `Leave a business alone for ${BUSINESS_DECLINE_GRACE_MONTHS} months with no investment of any kind and it starts to slide: it loses ${pct(
            BUSINESS_DECLINE_PCT_MIN
          )}–${pct(BUSINESS_DECLINE_PCT_MAX)} of its income every ${BUSINESS_DECLINE_INTERVAL_MONTHS} months until you tend to it again.`,
        },
        {
          type: 'p',
          text: 'Its name turns yellow as a warning and red once it is actually declining. Buying ANY upgrade — even the cheapest one — resets the clock completely.',
        },
        {
          type: 'p',
          text: `And you are never locked out of doing so: even with every other track maxed and every earned campaign spent, each business can still run ${MARKETING_UPKEEP_CAMPAIGNS_PER_MONTH} upkeep Marketing campaign a month, which counts as tending it.`,
        },
      ],
    },
    {
      id: 'exits',
      icon: '💼',
      title: 'Buyout offers',
      blocks: [
        {
          type: 'p',
          text: `Roughly once every ${Math.round(
            1 / BUSINESS_EXIT_CHANCE_PER_MONTH
          )} months a buyer approaches one random business owner about their most valuable business. If it's you, the game pauses and you decide: take the cash, or keep the monthly income.`,
        },
        {
          type: 'rows',
          rows: Object.keys(BUSINESS_EXIT_MULTIPLIER_WEIGHTS)
            .map(Number)
            .sort((a, b) => a - b)
            .map((mult) => ({
              label: `${mult}× annual revenue`,
              detail: `${BUSINESS_EXIT_RARITY_LABELS[mult] || 'rare'} — ${
                mult >= 8 ? 'take it.' : mult <= 1 ? 'a lowball; you can walk away.' : 'a fair, ordinary offer.'
              }`,
            })),
        },
        {
          type: 'p',
          text: 'The offer is a multiple of a YEAR of that business’s revenue, so the bigger you have grown it, the bigger the cheque. Selling ends that monthly income for good, though — there is a real trade-off.',
        },
      ],
    },
    {
      id: 'weather',
      icon: '🌦️',
      title: 'The weather',
      blocks: [
        {
          type: 'p',
          text: 'The economy cycles through five kinds of weather, in order, on a timer nobody can see. It pushes every price up or down and decides how likely a good fortune card is versus a bad one.',
        },
        {
          type: 'rows',
          rows: WEATHER_ORDER.map((id) => {
            const stage = WEATHER_STAGES[id];
            const dir = stage.marketDrift >= 0 ? 'up' : 'down';
            return {
              label: `${stage.icon} ${stage.name}`,
              detail: `${stage.blurb} Prices drift ${dir} about ${pct(Math.abs(stage.marketDrift))} a month. Lasts ${
                stage.minMonths
              }–${stage.maxMonths} months.`,
            };
          }),
        },
        {
          type: 'p',
          text: `The weather moves your BUSINESS revenue too, not just prices. Right now you are playing on ${severity.icon} ${severity.name} weather, so a Stormy Bust cuts business income by about ${Math.abs(
            Math.round((severityScaled(WEATHER_STAGES.stormyBust.businessIncomeFactor, severity.id, 1) - 1) * 100)
          )}% and a Sunny Boom lifts it by about ${Math.round(
            (severityScaled(WEATHER_STAGES.sunnyBoom.businessIncomeFactor, severity.id, 1) - 1) * 100
          )}%.`,
        },
        {
          type: 'rows',
          rows: WEATHER_SEVERITIES.map((w) => ({ label: `${w.icon} ${w.name}`, detail: w.tagline })),
        },
        {
          type: 'p',
          text: 'Storms are not only bad news: everything is cheaper to buy, and the cycle always turns. Buying when things look grim is how a lot of real money gets made.',
        },
      ],
    },
    {
      id: 'cards',
      icon: '🎴',
      title: 'Fortune cards',
      blocks: [
        {
          type: 'p',
          text: 'At the end of every month each player draws one card. Some are opportunities, some are setbacks, and which deck is more likely depends on the weather.',
        },
        {
          type: 'p',
          text: 'A card about a thing only affects players who own that thing. A card about tree houses pays (or costs) you per tree house you own, and does nothing at all if you own none — it will say so. Money in this game comes from what you own, and the cards follow that rule.',
        },
        {
          type: 'rows',
          rows: [
            { label: '💵 Cash', detail: 'A one-off gain or cost from ordinary life — a grant, a repair, an insurance bill.' },
            { label: '📦 Per item owned', detail: 'Scales with how many you hold. Nothing to hold, nothing happens.' },
            { label: '🏦 A share of your holdings', detail: 'You actually lose (or gain) units of something — a bank failure takes part of your savings for good.' },
            { label: '🚀 Your business revenue', detail: 'A permanent change to your best business, up or down. A lost partner really is a lost partner.' },
            { label: '🛑 Business paused', detail: 'Your businesses earn nothing for a month or two — broken equipment, no one to do the work.' },
            { label: '📅 Your allowance', detail: 'Temporarily higher or lower for a few months, then back to normal on its own.' },
            { label: '📈 Market news', detail: 'Moves a price for everyone at the table, which only matters if you hold it.' },
          ],
        },
        {
          type: 'p',
          text: 'Setbacks are meant to be survivable, not fatal: a business can never be driven to zero income, and nothing you already bought is confiscated. The point is that a bad month is normal, and being spread out is what makes it survivable.',
        },
      ],
    },
    {
      id: 'badges',
      icon: '🏅',
      title: 'Badges',
      blocks: [
        {
          type: 'p',
          text: 'Badges are awarded automatically at month-end when you meet the condition. They don’t change your score — they track the habits worth building, and they unlock avatars and board themes across games.',
        },
        {
          type: 'rows',
          rows: BADGES.map((b) => ({ label: `${b.icon} ${b.name}`, detail: b.description })),
        },
      ],
    },
    {
      id: 'tips',
      icon: '💡',
      title: 'Five things that actually win games',
      blocks: [
        {
          type: 'list',
          items: [
            'Buy a skill early, then a business. A business out-earns everything else in the game over 24 months.',
            'Spread out. Owning one of everything protects you when one thing crashes — that is what diversification means.',
            'Reinvest in what you already own before starting something new. Percentage payoffs compound on a bigger base.',
            'Marketing is a spike, not a strategy. Sales and R&D are permanent; campaigns fade — and you only get more of them by building something real.',
            'Never let a business go quiet for six months. A cheap Operations upgrade costs less than the income you lose to decline.',
          ],
        },
      ],
    },
  ];
}

/** Every difficulty preset, for the rulebook's "goal" section to show what
 * the other settings would have given you. Exported separately so the modal
 * can render it without importing gameConfig itself. */
export const RULEBOOK_DIFFICULTIES = DIFFICULTIES;
