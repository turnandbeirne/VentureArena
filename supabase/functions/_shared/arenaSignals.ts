// Venture Arena: style signals, personas, and ratings derived from a finished
// VentureFlow room. Pure functions — no I/O — so they can be unit-tested with
// node (see scripts/test-arena-signals.mjs) and reused by any future game
// module that exposes the same {moves, finalState} shape.
//
// Six style dimensions, each 0–100 (blueprint §2.2):
//   risk        — volatility-weighted share of spending; businesses count as risky
//   horizon     — share of spend on long-payoff moves (businesses, upgrades, skills)
//   negotiation — how the player handles buyout offers (holding out vs. taking)
//   cooperation — table chat and staying at the table (no resign)
//   speed       — how quickly the player ends turns once it's their move
//   resilience  — standing at the midpoint vs. the end (comebacks score high)
import { gameReducer, seedRng, netWorth } from './bundle.generated.js';

// VentureFlow asset volatility (data/gameConfig.js ASSETS). Unknown ids fall
// back to MID so a future asset doesn't break scoring.
const ASSET_VOLATILITY: Record<string, number> = { piggy: 0.02, treehouse: 0.09, lemonade: 0.15, treasure: 0.4 };
const BUSINESS_VOLATILITY = 0.3;
const MAX_VOLATILITY = 0.4;
const MID = 0.12;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

export type StyleSignals = {
  risk: number; horizon: number; negotiation: number; cooperation: number; speed: number; resilience: number;
  raw: Record<string, number>;
};

/** Replays the move log once more, this time watching each human seat's
 * decisions, and returns one StyleSignals per seat index. `moves` must be
 * the full ordered log with {seat_index, action, created_at}. */
export function computeStyleSignals(rngSeed: number, moves: any[], finalState: any, humanSeats?: number[]): Map<number, StyleSignals> {
  const perSeat = new Map<number, any>();
  const seatOf = (playerId: string) => finalState.players.findIndex((p: any) => p.id === playerId);
  const acc = (seat: number) => {
    if (!perSeat.has(seat)) {
      perSeat.set(seat, {
        spend: 0, weightedVol: 0, longSpend: 0, offersDeclined: 0, offersAccepted: 0, chats: 0, resigned: 0,
        turnSeconds: [] as number[], turns: 0,
      });
    }
    return perSeat.get(seat);
  };

  seedRng(rngSeed);
  let state: any = null;
  let lastMoveAt: number | null = null;
  for (const move of moves) {
    const a = move.action ?? {};
    const seat = typeof move.seat_index === 'number' ? move.seat_index : a.playerId ? seatOf(a.playerId) : -1;
    const at = move.created_at ? new Date(move.created_at).getTime() : null;
    if (seat >= 0 && state) {
      const s = acc(seat);
      const prices = state.assetPrices ?? {};
      switch (a.type) {
        case 'BUY_ASSET': {
          const qty = Number(a.qty ?? a.quantity ?? 1) || 1;
          const cost = (prices[a.assetId] ?? 0) * qty;
          const vol = ASSET_VOLATILITY[a.assetId] ?? MID;
          s.spend += cost; s.weightedVol += cost * vol;
          break;
        }
        case 'START_BUSINESS': { const cost = 300; s.spend += cost; s.weightedVol += cost * BUSINESS_VOLATILITY; s.longSpend += cost; break; }
        case 'UPGRADE_BUSINESS': { const cost = 150; s.spend += cost; s.weightedVol += cost * MID; s.longSpend += cost; break; }
        case 'LEARN_SKILL': { const cost = 100; s.spend += cost; s.weightedVol += cost * MID; s.longSpend += cost; break; }
        case 'RESOLVE_EXIT_OFFER': { if (a.accept) s.offersAccepted += 1; else s.offersDeclined += 1; break; }
        case 'SEND_CHAT': s.chats += 1; break;
        case 'CONVERT_SEAT_TO_AI': s.resigned = 1; break;
        case 'END_TURN': {
          s.turns += 1;
          if (at != null && lastMoveAt != null) s.turnSeconds.push((at - lastMoveAt) / 1000);
          break;
        }
        default: break;
      }
    }
    state = gameReducer(state, a);
    if (at != null) lastMoveAt = at;
  }

  // Resilience: rank at the midpoint (month 12 snapshot) vs. final rank.
  const players: any[] = finalState.players ?? [];
  const midMonth = 12;
  const midWorth = players.map((p) => p.netWorthHistory?.find((h: any) => h.month === midMonth)?.netWorth ?? null);
  const finalWorth = players.map((p) => netWorth(p, finalState.assetPrices));
  const rankOf = (arr: (number | null)[], i: number) =>
    arr.filter((v, j) => j !== i && v != null && (v as number) > (arr[i] as number)).length + 1;

  const out = new Map<number, StyleSignals>();
  const wanted = new Set(humanSeats ?? players.map((p, i) => (p.type === 'human' ? i : -1)).filter((i) => i >= 0));
  players.forEach((_p, seat) => {
    if (!wanted.has(seat)) return;
    const s = acc(seat);
    const risk = s.spend > 0 ? (s.weightedVol / s.spend / MAX_VOLATILITY) * 100 : 35;
    const horizon = s.spend > 0 ? (s.longSpend / s.spend) * 100 : 40;
    const offers = s.offersAccepted + s.offersDeclined;
    const negotiation = offers === 0 ? 50 : 50 + 25 * ((s.offersDeclined - s.offersAccepted) / offers);
    const cooperation = clamp(35 + Math.min(s.chats, 8) * 8 - s.resigned * 30);
    let speed = 50;
    if (s.turnSeconds.length) {
      const sorted = [...s.turnSeconds].sort((x, y) => x - y);
      const median = sorted[Math.floor(sorted.length / 2)];
      // 20s → ~95, 2 min → ~65, 10 min → ~35, 1 h → ~10 (log scale)
      speed = clamp(115 - 16 * Math.log2(Math.max(median, 10) / 10));
    }
    let resilience = 50;
    if (midWorth[seat] != null && players.length > 1) {
      const midRank = rankOf(midWorth, seat);
      const finalRank = rankOf(finalWorth as any, seat);
      resilience = clamp(50 + (midRank - finalRank) * 20 + (midRank > 1 && finalRank === 1 ? 15 : 0));
    }
    out.set(seat, {
      risk: clamp(risk), horizon: clamp(horizon), negotiation: clamp(negotiation), cooperation, speed, resilience,
      raw: { spend: Math.round(s.spend), longSpend: Math.round(s.longSpend), offersDeclined: s.offersDeclined, offersAccepted: s.offersAccepted, chats: s.chats, turns: s.turns, resigned: s.resigned },
    });
  });
  return out;
}

export type PersonaDims = { risk: number; horizon: number; negotiation: number; cooperation: number; speed: number; resilience: number };

/** Friendly label for a position in style space (blueprint §2.2). Order matters:
 * the first matching rule wins, so the more specific reads come first. */
export function personaLabel(d: PersonaDims): string {
  if (d.negotiation >= 65) return 'Dealmaker';
  if (d.risk >= 65 && d.speed >= 60) return 'Wildcard';
  if (d.cooperation >= 70) return 'Connector';
  if (d.resilience >= 68) return 'Closer';
  if (d.horizon >= 60 && d.cooperation >= 55) return 'Builder';
  if (d.horizon >= 60) return 'Strategist';
  if (d.risk <= 40 && d.speed <= 55) return 'Operator';
  return 'Explorer';
}

/** Running mean: fold a new game's signals into the stored persona. */
export function mergePersona(prev: (PersonaDims & { games_counted: number }) | null, next: PersonaDims) {
  const n = prev?.games_counted ?? 0;
  const mix = (k: keyof PersonaDims) => Math.round(((prev?.[k] ?? 50) * n + next[k]) / (n + 1));
  const dims: PersonaDims = {
    risk: mix('risk'), horizon: mix('horizon'), negotiation: mix('negotiation'),
    cooperation: mix('cooperation'), speed: mix('speed'), resilience: mix('resilience'),
  };
  return { ...dims, label: personaLabel(dims), games_counted: n + 1 };
}

/** Pairwise multiplayer Elo. Humans are rated against each other with
 * K=32 split across opponents; AI seats count as fixed 1200-rated opponents
 * at K=8 each, so a solo game against bots moves the rating a little but a
 * table of humans moves it a lot. Returns {seatIndex → newRating}. */
export function ratingUpdates(
  seatsRanked: { seat: number; placement: number; human: boolean; rating: number }[],
): Map<number, number> {
  const out = new Map<number, number>();
  const humans = seatsRanked.filter((s) => s.human);
  for (const me of humans) {
    let delta = 0;
    for (const other of seatsRanked) {
      if (other.seat === me.seat) continue;
      const score = me.placement < other.placement ? 1 : me.placement === other.placement ? 0.5 : 0;
      const expected = 1 / (1 + Math.pow(10, (other.rating - me.rating) / 400));
      const k = other.human ? 32 / Math.max(1, humans.length - 1) : 8;
      delta += k * (score - expected);
    }
    out.set(me.seat, Math.round(me.rating + delta));
  }
  return out;
}
