// DEV-ONLY in-memory stand-in for lib/supabaseClient.js (aliased in
// vite.preview.config.js). Just enough of the supabase-js surface for the
// Arena screens: auth session, table reads with eq/in/or/order/limit,
// rpc() with canned results, storage getPublicUrl. ?guest=1 previews the
// anonymous experience.
const ME = '11111111-1111-1111-1111-111111111111';
const DEV = '22222222-2222-2222-2222-222222222222';
const LENA = '33333333-3333-3333-3333-333333333333';
const params = new URLSearchParams(window.location.search);
const guest = params.get('guest') === '1';
const onboard = params.get('onboard') === '1';
const signedOut = params.get('auth') === '1';

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

const T = {
  vm_profiles: [
    { id: ME, display_name: 'Michael', avatar: '🦈', photo_url: null, is_guest: guest, tier: 'premium', color_ranks: ['gold', 'teal', 'plum'], headline: 'Building Venture Arena', business_stage: 'building', industry: 'edtech', looking_for: 'game designers and a technical co-founder', current_project: 'Venture Arena v2', goals: 'launch VentureBoom, meet investors', social_links: { linkedin: 'https://linkedin.com/in/michael' }, city: 'New York', region: 'NY', share_location: true, onboarding_done_at: onboard ? null : '2026-09-01T00:00:00Z', email_verified: true, survey_score: 85, streak_count: 4, points_balance: 185, last_seen_at: iso(0) },
    { id: DEV, display_name: 'Dev Patel', avatar: '🦁', photo_url: null, is_guest: false, tier: 'member', color_ranks: ['gold', 'teal', 'brick'], headline: 'Fintech founder, pre-seed', business_stage: 'launched', industry: 'fintech', last_seen_at: iso(30_000) },
    { id: LENA, display_name: 'Lena Ortiz', avatar: '🦉', photo_url: null, is_guest: false, tier: 'free', color_ranks: ['teal'], headline: 'Ex-operator, now advising', business_stage: 'investor', industry: 'consumer', last_seen_at: iso(90_000) },
  ],
  vm_colors: [
    ['gold', 'Gold', '#C9962B'], ['felt', 'Felt Green', '#1F6A4B'], ['teal', 'Teal', '#1C7C86'], ['plum', 'Plum', '#6B3D8C'], ['brick', 'Brick', '#B24A2F'], ['cobalt', 'Cobalt', '#2F5DA8'],
    ['coral', 'Coral', '#D97B3C'], ['slate', 'Slate', '#5B6478'], ['rose', 'Rose', '#B83B6E'], ['olive', 'Olive', '#6F7F2B'], ['ink', 'Ink', '#16203A'], ['sky', 'Sky', '#3E8FD1'],
  ].map(([key, name, hex], i) => ({ key, name, hex, sort_order: i + 1 })),
  vm_games: [
    { id: 'g1', slug: 'ventureflow', name: 'VentureFlow', status: 'live', icon: '📈', description: 'Build a portfolio, race the clock, out-invest the table.', min_seats: 2, max_seats: 5, sort_order: 1 },
    { id: 'g2', slug: 'ventureboom', name: 'VentureBoom', status: 'coming_soon', icon: '🚀', description: 'Launch, scale and survive the boom — in Labs next month.', sort_order: 2 },
    { id: 'g3', slug: 'boardgameuniverse', name: 'BoardGameUniverse', status: 'external_link', icon: '🌐', description: 'Free online board games and strategy challenges.', external_url: 'https://boardgameuniverse.com', sort_order: 3 },
  ],
  vm_rooms: [
    { id: 'r1', invite_code: 'k3f9a2c1', status: 'active', host_id: ME, game_id: 'g1', name: 'Friday founders', created_at: iso(3_600_000) },
    { id: 'r2', invite_code: 'p8d2q7x0', status: 'open', host_id: DEV, game_id: 'g1', name: null, created_at: iso(600_000) },
  ],
  vm_room_seats: [
    { room_id: 'r1', seat_index: 0, user_id: ME, color_key: 'gold' }, { room_id: 'r1', seat_index: 1, user_id: DEV, color_key: 'teal' }, { room_id: 'r1', seat_index: 2, bot_personality_id: 'mrb', color_key: 'felt' },
    { room_id: 'r2', seat_index: 0, user_id: DEV }, { room_id: 'r2', seat_index: 1 }, { room_id: 'r2', seat_index: 2 },
  ],
  vm_friendships: [{ user_id: DEV, friend_id: ME, status: 'accepted' }, { user_id: LENA, friend_id: ME, status: 'pending' }],
  vm_challenges: [
    { id: 'c1', challenger_id: DEV, challenged_id: ME, status: 'pending', message: 'Rematch? I want my rating back.', created_at: iso(120_000), expires_at: new Date(now + 40 * 3_600_000).toISOString(), room_id: null, vm_games: { slug: 'ventureflow', name: 'VentureFlow', icon: '📈' } },
  ],
  vm_topic_replies: [
    { id: 't1', body: 'Close fast if the investor brings distribution. Valuation is a vanity metric at seed.', created_at: iso(2_400_000), user_id: DEV, vm_profiles: { display_name: 'Dev Patel', avatar: '🦁' } },
  ],
  vm_points_ledger: [
    { id: 'p1', kind: 'game_won', points: 25, created_at: iso(86_400_000) }, { id: 'p2', kind: 'checkin', points: 10, created_at: iso(86_400_000) }, { id: 'p3', kind: 'quiz', points: 10, created_at: iso(172_800_000) },
  ],
  vm_game_results: [
    { user_id: ME, room_id: 'r1', placement: 1, player_count: 3, rating_before: 1212, rating_after: 1228, signals: { risk: 68, horizon: 62, negotiation: 75, cooperation: 51, speed: 71, resilience: 50, raw: { offersDeclined: 2 } } },
  ],
  vm_invites: [{ id: 'i1', inviter_id: ME, channel: 'sms', contact: '+1 555 010 2233', invitee_name: 'Sam', room_code: null, created_at: iso(3_600_000), joined_at: null }],
  vm_personas: [
    { user_id: ME, risk: 61, horizon: 64, negotiation: 71, cooperation: 48, speed: 66, resilience: 55, label: 'Dealmaker', games_counted: 7 },
    { user_id: DEV, risk: 30, horizon: 40, negotiation: 50, cooperation: 60, speed: 40, resilience: 50, label: 'Operator', games_counted: 3 },
  ],
};

const RPC = {
  vm_checkin: () => [{ streak: 5, awarded: true, points_balance: 195 }],
  vm_touch_presence: () => null,
  vm_today_topic: () => [{ id: 'topic1', theme: 'Fundraising', title: 'Take the money?', prompt: 'An investor offers a term sheet today at a valuation 30% below what you wanted. Do you close fast or keep raising? What would change your answer?' }],
  vm_today_quiz: () => [{ id: 'q1', theme: 'Finance', question: 'A company sells $50k of product on 60-day terms and pays $40k of costs immediately. This month its cash position...', options: ['Rises by $10k', 'Falls by $40k', 'Rises by $50k', 'Is unchanged'], answered: false }],
  vm_answer_quiz: ({ p_choice }) => [{ correct: p_choice === 1, answer_index: 1, explanation: 'Revenue was earned but the cash arrives in 60 days; the $40k of costs left the account now.', awarded: true }],
  vm_reply_to_topic: () => 'new-reply',
  vm_online_members: () => T.vm_profiles.filter((p) => p.id !== ME).map((p) => ({ ...p, persona_label: T.vm_personas.find((x) => x.user_id === p.id)?.label ?? null })),
  vm_recent_tablemates: () => [{ user_id: DEV, games_together: 4, last_played: iso(3_600_000) }],
  vm_request_friend: () => null,
  vm_respond_friend: () => null,
  vm_find_profile_by_email: () => [{ id: LENA, display_name: 'Lena Ortiz', avatar: '🦉' }],
  vm_send_challenge: () => 'c-new',
  vm_respond_to_challenge: () => 'r1',
  vm_cancel_challenge: () => null,
  vm_express_premium_interest: () => null,
  vm_my_referral_code: () => 'MB7K2QWX',
  vm_my_profile: () => T.vm_profiles.find((p) => p.id === ME),
  vm_profile_cards: ({ p_ids }) => T.vm_profiles.filter((p) => p_ids.includes(p.id)).map((p) => ({ ...p, locked: false })),
  vm_match_suggestions_gated: (a) => RPC.vm_match_suggestions(a),
  vm_access: () => ({ level: guest ? 'anonymous' : 'member', tier: 'premium', paid: true, survey_score: 85, email_verified: true, can_see_bios: !guest, can_get_intros: !guest,
    paid_features: { lessons: true, matchmaking_plus: true, prizes: true, classes: true, pitch_reviews: true, recruiting: true, coaching: false, consulting: false } }),
  vm_recompute_survey: () => [{ score: 85, bonus_awarded: 100 }],
  vm_finish_onboarding: () => null,
  vm_log_invite: () => 'inv-new',
  vm_claim_referral: () => true,
  vm_set_location: () => null,
  vm_public_profile: ({ p_user_id }) => ({ ...T.vm_profiles.find((p) => p.id === p_user_id), social_links: { linkedin: 'https://linkedin.com/in/devpatel', website: 'https://payflow.app' }, current_project: 'Payflow — invoicing for youth sports clubs', goals: 'find a technical co-founder', city: 'Brooklyn', region: 'NY' }),
  vm_match_suggestions: () => [
    { user_id: DEV, score: 79, reasons: ["Matches what you're looking for", 'Same industry', 'Complementary stage — one has done what the other is doing', 'Nearby — Brooklyn'], distance_km: 5 },
    { user_id: LENA, score: 24, reasons: ['Complementary playing styles (Dealmaker + Operator)', 'Both have a project underway'], distance_km: null },
  ],
  vm_assign_seat_colors: ({ p_room_id }) => T.vm_room_seats.filter((s) => s.room_id === p_room_id).map((s) => ({ seat_index: s.seat_index, color_key: s.color_key ?? null })),
  vm_arena_record: ({ p_user_id }) => ({
    profile: T.vm_profiles.find((p) => p.id === p_user_id),
    persona: T.vm_personas.find((x) => x.user_id === p_user_id) ?? null,
    ratings: p_user_id === ME ? [{ game: 'ventureflow', name: 'VentureFlow', rating: 1228, games: 7, wins: 3 }] : [{ game: 'ventureflow', name: 'VentureFlow', rating: 1180, games: 3, wins: 0 }],
    badges: p_user_id === ME ? [{ id: 'boss', name: 'Boss', icon: '🚀', count: 2 }, { id: 'balancedInvestor', name: 'Balanced Investor', icon: '🧺', count: 1 }] : [],
    recent: p_user_id === ME ? [
      { room_id: 'r1', game: 'ventureflow', placement: 1, players: 3, score: 6740, rating_after: 1228, delta: 16, finished_at: iso(86_400_000) },
      { room_id: 'r0', game: 'ventureflow', placement: 2, players: 4, score: 5210, rating_after: 1212, delta: -6, finished_at: iso(259_200_000) },
    ] : [],
    rank: p_user_id === ME ? 'Founder' : 'Rookie',
  }),
};

function query(table) {
  let rows = [...(T[table] || [])];
  const b = {
    select() { return b; },
    eq(col, val) { rows = rows.filter((r) => r[col] === val); return b; },
    in(col, vals) { rows = rows.filter((r) => vals.includes(r[col])); return b; },
    or(expr) {
      const parts = expr.split(',').map((p) => p.split('.eq.'));
      rows = rows.filter((r) => parts.some(([col, val]) => r[col] === val));
      return b;
    },
    order(col, { ascending = true } = {}) { rows.sort((a, c) => (a[col] > c[col] ? 1 : -1) * (ascending ? 1 : -1)); return b; },
    limit(n) { rows = rows.slice(0, n); return b; },
    update(patch) { rows.forEach((r) => Object.assign(r, patch)); return b; },
    insert(row) { (T[table] ||= []).push(...(Array.isArray(row) ? row : [row])); return b; },
    maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
    single() { return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } }); },
    then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
  };
  return b;
}

const session = signedOut ? null : { user: { id: ME, email: guest ? undefined : 'michael@example.com', is_anonymous: guest } };

export const supabase = {
  auth: {
    getSession: () => Promise.resolve({ data: { session } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: () => Promise.resolve({}),
    updateUser: () => Promise.resolve({ error: null }),
    signInAnonymously: () => Promise.resolve({ error: null }),
  },
  from: query,
  rpc: (name, args = {}) => Promise.resolve({ data: RPC[name] ? RPC[name](args) : null, error: RPC[name] ? null : { message: `no mock for ${name}` } }),
  storage: { from: () => ({ upload: () => Promise.resolve({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: '/' + p } }) }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel() {},
};

export async function resolveMove() {
  return { state: null };
}
