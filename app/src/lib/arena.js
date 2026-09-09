// Venture Arena data layer: profiles, colors, rhythms (topic / quiz /
// check-in), friends, challenges, records and presence. Everything that
// mutates goes through the security-definer SQL functions from migration
// 0006 so tier limits and guest restrictions are enforced server-side.
import { supabase } from './supabaseClient.js';

async function rpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(cleanError(error.message));
  return data;
}

/** Postgres raises come back as "P0001: message" style strings; show just the message. */
function cleanError(msg) {
  return String(msg || 'Something went wrong').replace(/^[A-Z0-9]{5}:\s*/, '');
}

export const TIER_LABELS = { free: 'Free', member: 'Member', premium: 'Premium', vip: 'VIP' };
export const PERSONA_BLURBS = {
  Builder: 'Long horizon, cooperative — you build things that compound.',
  Dealmaker: 'Negotiation-led — you hold out for the better trade.',
  Wildcard: 'High risk, fast moves — you make the table nervous.',
  Strategist: 'Long horizon, competitive — you plan several months ahead.',
  Operator: 'Deliberate and steady — low variance, few mistakes.',
  Connector: 'Cooperative and social — the table talks when you are in it.',
  Closer: 'Strong under pressure — you come back from behind.',
  Explorer: 'Trying everything — your style is still taking shape.',
};

// ---- Profile ---------------------------------------------------------------
export async function getMyProfile(userId) {
  const { data, error } = await supabase.from('vm_profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(userId, patch) {
  const { data, error } = await supabase.from('vm_profiles').update(patch).eq('id', userId).select().single();
  if (error) throw new Error(cleanError(error.message));
  return data;
}

export async function uploadAvatarPhoto(userId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('vm-avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(cleanError(error.message));
  const { data } = supabase.storage.from('vm-avatars').getPublicUrl(path);
  return data.publicUrl;
}

export async function listColors() {
  const { data, error } = await supabase.from('vm_colors').select('*').order('sort_order');
  if (error) throw error;
  return data;
}

// ---- Rhythms ----------------------------------------------------------------
export const checkIn = () => rpc('vm_checkin').then((rows) => rows?.[0] ?? null);
export const touchPresence = () => rpc('vm_touch_presence').catch(() => {});
export const todayTopic = () => rpc('vm_today_topic').then((rows) => rows?.[0] ?? null);
export const todayQuiz = () => rpc('vm_today_quiz').then((rows) => rows?.[0] ?? null);
export const answerQuiz = (questionId, choice) => rpc('vm_answer_quiz', { p_question_id: questionId, p_choice: choice }).then((rows) => rows?.[0] ?? null);
export const replyToTopic = (topicId, body) => rpc('vm_reply_to_topic', { p_topic_id: topicId, p_body: body });

export async function listTopicReplies(topicId) {
  const { data, error } = await supabase
    .from('vm_topic_replies')
    .select('id, body, created_at, user_id, vm_profiles(display_name, avatar, photo_url)')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function myPointsHistory(limit = 20) {
  const { data, error } = await supabase.from('vm_points_ledger').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

// ---- People ------------------------------------------------------------------
export const onlineMembers = () => rpc('vm_online_members', { p_limit: 30 });
export const recentTablemates = () => rpc('vm_recent_tablemates', { p_limit: 12 });
export const requestFriend = (friendId) => rpc('vm_request_friend', { p_friend_id: friendId });
export const respondFriend = (userId, accept) => rpc('vm_respond_friend', { p_user_id: userId, p_accept: accept });
export const findProfileByEmail = (email) => rpc('vm_find_profile_by_email', { p_email: email }).then((rows) => rows?.[0] ?? null);

export async function listFriendships(userId) {
  const { data, error } = await supabase
    .from('vm_friendships')
    .select('user_id, friend_id, status, created_at')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
  if (error) throw error;
  return data;
}

export async function fetchProfiles(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return {};
  const { data, error } = await supabase
    .from('vm_profiles')
    .select('id, display_name, avatar, photo_url, tier, is_guest, headline, business_stage, industry, last_seen_at, color_ranks')
    .in('id', unique);
  if (error) throw error;
  const byId = {};
  for (const p of data) byId[p.id] = p;
  return byId;
}

export async function fetchPersonas(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return {};
  const { data, error } = await supabase.from('vm_personas').select('*').in('user_id', unique);
  if (error) throw error;
  const byId = {};
  for (const p of data) byId[p.user_id] = p;
  return byId;
}

// ---- Challenges ---------------------------------------------------------------
export const sendChallenge = (toUserId, gameSlug = 'ventureflow', message = null) =>
  rpc('vm_send_challenge', { p_to: toUserId, p_game_slug: gameSlug, p_message: message });
export const respondToChallenge = (challengeId, accept) => rpc('vm_respond_to_challenge', { p_challenge_id: challengeId, p_accept: accept });
export const cancelChallenge = (challengeId) => rpc('vm_cancel_challenge', { p_challenge_id: challengeId });

export async function listMyChallenges() {
  const { data, error } = await supabase
    .from('vm_challenges')
    .select('id, challenger_id, challenged_id, status, message, created_at, expires_at, room_id, vm_games(slug, name, icon)')
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}

// ---- Records ------------------------------------------------------------------
export const arenaRecord = (userId) => rpc('vm_arena_record', { p_user_id: userId });

export async function listGames() {
  const { data, error } = await supabase.from('vm_games').select('*').order('sort_order');
  if (error) throw error;
  return data;
}

export async function roomResults(roomId) {
  const { data, error } = await supabase.from('vm_game_results').select('*').eq('room_id', roomId);
  if (error) throw error;
  return data;
}

export const expressPremiumInterest = () => rpc('vm_express_premium_interest');

// ---- Formatting helpers ---------------------------------------------------------
export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Rooms the member hosts or sits in — shared with the Play tab.
export { listMyRooms as listMyRoomsBrief } from './rooms.js';

export function timeUntil(iso) {
  if (!iso) return '';
  const s = Math.max(0, (new Date(iso).getTime() - Date.now()) / 1000);
  if (s < 3600) return `in ${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `in ${Math.floor(s / 3600)}h`;
  return `in ${Math.floor(s / 86400)}d`;
}
