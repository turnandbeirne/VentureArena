// ============================================================================
// Bot chat — the robots reacting in-character to what's happening
// ----------------------------------------------------------------------------
// Every log entry that already flows through the event log (see
// reducer.js's appendLog) is also offered to reactToLogEntries() here,
// which probabilistically turns some of them into in-character chat lines
// from BOT_CHAT_LINES (gameConfig.js) — a business started, a badge earned,
// the weather turning, a fortune card landing, a turn starting, the game
// ending. Reactions are deliberately infrequent for high-volume events (a
// single buy/sell) and near-certain for rare, exciting ones (the game
// ending) so the feed reads like genuine color commentary rather than
// noise.
//
// Only robots with a `personalityId` (see gameConfig.js BOT_PERSONALITIES)
// ever speak — a game saved before this feature existed has robots with no
// personalityId at all, and they simply stay quiet rather than crashing or
// speaking with a generic voice.
// ============================================================================
import { BOT_CHAT_LINES, getBotPersonality } from '../data/gameConfig';
import { getStageInfo } from './weather';
import { turnOrdinal } from './turnClock';
// `chance` is imported under an alias because two reaction branches below
// already use a local `chance` variable for their own per-entry probability.
// Every gate here goes through the seeded stream rather than Math.random():
// chat entries are stored IN game state, so a raw Math.random() would make
// two clients replaying the same actions end up with different state — and
// it already made Daily Challenge chat non-reproducible.
import { pickRandom, chance as rollChance } from './rng';

// How often each kind of log entry gets a chat reaction at all. Missing
// kinds (payday, and anything future) simply never trigger chat.
const REACT_CHANCE = {
  business: 0.5,
  badge: 0.75,
  skill: 0.18,
  buy: 0.05,
  sell: 0.05,
  weather: 0.35,
  fortuneGood: 0.18,
  fortuneBad: 0.18,
  endTurn: 0.16,
  gameover: 0.7,
  objectiveMet: 0.8, // a scenario goal reached (Passive Income Race / Business Sprint) — see game/scenarios.js
  leadChange: 0.5, // the net-worth standings just flipped — see game/turnEngine.js
  businessUpgrade: 0.35, // investing in Marketing/Sales/Ops/R&D — see game/businessUpgrades.js
  businessRnd: 0.6, // an R&D project actually paid off — see game/turnEngine.js
  businessExit: 0.85, // a buyout offer landed — see game/businessExits.js/turnEngine.js
};

// After a bot speaks, this is the chance a *different* bot chimes in with a
// short banter follow-up aimed at the first speaker — the "bot to bot"
// chatter. Solo mode caps at 2 robots, so this is always just the other one.
const BANTER_FOLLOWUP_CHANCE = 0.3;

// Rolled independently once per robot turn (see generateBotTurnFlavor) — a
// bot can land a sound effect, a hype quote, both, or neither on any given
// turn. Kept fairly rare so the goofiness stays a treat, not a wall of noise.
const SFX_CHANCE = 0.22;
const HYPE_CHANCE = 0.16;

// Used if a personality has no sfxPool of its own (shouldn't happen for any
// of the seven, but keeps this robust against a future personality that
// forgets to set one).
const DEFAULT_SFX_POOL = ['botLaugh', 'botOhYeah'];

// A short human-readable caption for each sound-effect chat entry — the
// chat feed still needs *something* to show/read even though the point is
// the noise, not the words.
const SFX_CAPTION = {
  botFart: '*toot*',
  botBurp: '*BURRRP*',
  botOhYeah: '"OH YEAAAAH!"',
  botGroan: '*groooans*',
  botTakeItBack: '"Take that back!"',
  botLaugh: '*big cartoon laugh*',
  botScreech: '*SCREEEECH*',
  botHeroSting: '"You haven\'t seen the last of me!"',
  botHiccup: '*HIC!*',
  botSquawk: '*SQUAWK!*',
  botAirhorn: '*BWAAAAP!* (airhorn)',
  botKiss: '"Mwah!"',
  botMicDrop: '*drops the mic*',
  botSneeze: '"AH-CHOO!"',
};

// A human-typed message (see createHumanChatEntry/reactToHumanChat below)
// always uses this color rather than a bot personality color, so a real
// player's line is visually distinct from every robot's at a glance.
const HUMAN_CHAT_COLOR = '#1c7ed6';

// Chance a bot chimes back after a human types something. There's no real
// language understanding here — just a canned, personality-flavored line —
// so this stays well under 100% to avoid the illusion of a bot that
// actually read the message.
const HUMAN_REPLY_CHANCE = 0.45;

function aiSpeakers(state) {
  return state.players.filter((p) => p.type === 'ai' && p.personalityId);
}

/** A random bot that can speak, other than `excludeId` (if given). */
function pickSpeaker(state, excludeId) {
  const pool = aiSpeakers(state).filter((p) => p.id !== excludeId);
  return pool.length > 0 ? pickRandom(pool) : null;
}

// How many turns a given canned line is off the table for after it's used.
// Without this, a personality with eight 'compliment' lines repeats itself
// noticeably within a single game — the same joke landing twice in three
// turns is what makes a bot read as a script rather than a character.
const CHAT_REPEAT_COOLDOWN_TURNS = 6;

/** Lines this table has heard within the cooldown window, as a Set for
 * O(1) lookup. Read straight off `state.chat` (already capped at 60
 * entries) rather than tracked separately — the transcript IS the memory. */
function recentlySaid(state) {
  const now = turnOrdinal(state);
  const recent = new Set();
  for (const entry of state.chat || []) {
    if (entry.turnNo == null) continue;
    if (now - entry.turnNo < CHAT_REPEAT_COOLDOWN_TURNS) recent.add(entry.message);
  }
  return recent;
}

/**
 * Pick a line for `category`, preferring one that hasn't been said in the
 * last CHAT_REPEAT_COOLDOWN_TURNS turns. Falls back to the full bank if
 * every line is on cooldown (a small category, or a very chatty stretch) —
 * repeating is better than a bot falling silent for no visible reason.
 */
function line(state, personalityId, category, vars) {
  const bank = BOT_CHAT_LINES[personalityId]?.[category];
  if (!bank || bank.length === 0) return null;
  const recent = recentlySaid(state);
  // Compare against the SUBSTITUTED text, since two different players'
  // names in the same template are genuinely different lines to a reader.
  const substitute = (template) => {
    let text = template;
    for (const [key, val] of Object.entries(vars || {})) {
      text = text.replaceAll(`{${key}}`, val);
    }
    return text;
  };
  const fresh = bank.filter((template) => !recent.has(substitute(template)));
  return substitute(pickRandom(fresh.length > 0 ? fresh : bank));
}

/** Build one chat entry from `speaker`, or null if that personality has no
 * lines for this category (nothing to say, so nothing is said). Every entry
 * carries the speaker's personality `color` (gameConfig.js
 * BOT_PERSONALITIES) so the UI can color-code each bot's bubbles — falls
 * back to null for a personality that somehow has no color set, which the
 * UI treats as "use the default neutral tint." */
function say(state, speaker, category, vars, targetPlayerId) {
  const text = line(state, speaker.personalityId, category, vars);
  if (!text) return null;
  return {
    speakerId: speaker.id,
    speakerName: speaker.name,
    speakerAvatar: speaker.avatar,
    color: getBotPersonality(speaker.personalityId)?.color || null,
    message: text,
    category,
    // Stamped so the cooldown above can tell how long ago this was said.
    // (reducer.js's appendChat adds `id` and `month` on top.)
    turnNo: turnOrdinal(state),
    targetPlayerId: targetPlayerId || null,
  };
}

/** Maybe have a second bot banter back at whoever just spoke. */
function maybeBanterFollowup(state, entries, spoken) {
  if (!spoken || !rollChance(BANTER_FOLLOWUP_CHANCE)) return;
  const responder = pickSpeaker(state, spoken.speakerId);
  if (!responder) return;
  const reply = say(state, responder, 'botBanter', { bot: spoken.speakerName }, spoken.speakerId);
  if (reply) entries.push(reply);
}

function reactionsForEntry(state, entry) {
  const entries = [];
  const kind = entry.kind || '';
  const actor = entry.playerId ? state.players.find((p) => p.id === entry.playerId) : null;
  const actorName = actor?.name || 'you';

  if (kind === 'business') {
    if (!rollChance(REACT_CHANCE.business)) return entries;
    const speaker = pickSpeaker(state, entry.playerId);
    if (!speaker) return entries;
    const category = rollChance(0.2) ? 'challenge' : 'compliment';
    const said = say(state, speaker, category, { player: actorName }, entry.playerId);
    if (said) {
      entries.push(said);
      maybeBanterFollowup(state, entries, said);
    }
    return entries;
  }

  if (kind === 'badge') {
    if (!rollChance(REACT_CHANCE.badge)) return entries;
    const speaker = pickSpeaker(state, entry.playerId);
    if (!speaker) return entries;
    const said = say(state, speaker, 'compliment', { player: actorName }, entry.playerId);
    if (said) entries.push(said);
    return entries;
  }

  if (kind === 'businessUpgrade') {
    if (!rollChance(REACT_CHANCE.businessUpgrade)) return entries;
    const speaker = pickSpeaker(state, entry.playerId);
    if (!speaker) return entries;
    const category = rollChance(0.2) ? 'challenge' : 'compliment';
    const said = say(state, speaker, category, { player: actorName }, entry.playerId);
    if (said) entries.push(said);
    return entries;
  }

  if (kind === 'businessRnd') {
    if (!rollChance(REACT_CHANCE.businessRnd)) return entries;
    const speaker = pickSpeaker(state, entry.playerId);
    if (!speaker) return entries;
    const said = say(state, speaker, 'compliment', { player: actorName }, entry.playerId);
    if (said) entries.push(said);
    return entries;
  }

  if (kind === 'businessExit') {
    if (!rollChance(REACT_CHANCE.businessExit)) return entries;
    const speaker = pickSpeaker(state, entry.playerId);
    if (!speaker) return entries;
    const category = rollChance(0.25) ? 'challenge' : 'compliment';
    const said = say(state, speaker, category, { player: actorName }, entry.playerId);
    if (said) {
      entries.push(said);
      maybeBanterFollowup(state, entries, said);
    }
    return entries;
  }

  if (kind === 'skill') {
    if (!rollChance(REACT_CHANCE.skill)) return entries;
    const speaker = pickSpeaker(state, entry.playerId);
    if (!speaker) return entries;
    const category = rollChance(0.5) ? 'compliment' : 'tease';
    const said = say(state, speaker, category, { player: actorName }, entry.playerId);
    if (said) entries.push(said);
    return entries;
  }

  if (kind.startsWith('buy_') || kind.startsWith('sell_')) {
    const isBuy = kind.startsWith('buy_');
    const chance = isBuy ? REACT_CHANCE.buy : REACT_CHANCE.sell;
    if (!rollChance(chance)) return entries;
    const speaker = pickSpeaker(state, entry.playerId);
    if (!speaker) return entries;
    const assetId = kind.slice(kind.indexOf('_') + 1);
    const category = isBuy && assetId === 'treasure' ? 'challenge' : 'tease';
    const said = say(state, speaker, category, { player: actorName }, entry.playerId);
    if (said) entries.push(said);
    return entries;
  }

  if (kind === 'weather') {
    if (!rollChance(REACT_CHANCE.weather)) return entries;
    const speaker = pickSpeaker(state, null);
    if (!speaker) return entries;
    const mood = getStageInfo(state.weather)?.mood;
    const category = mood === 'dip' || mood === 'bust' ? 'weatherBad' : 'weatherGood';
    const said = say(state, speaker, category, {});
    if (said) {
      entries.push(said);
      maybeBanterFollowup(state, entries, said);
    }
    return entries;
  }

  if (kind === 'fortuneGood' || kind === 'fortuneBad') {
    const chance = kind === 'fortuneGood' ? REACT_CHANCE.fortuneGood : REACT_CHANCE.fortuneBad;
    if (!rollChance(chance)) return entries;
    const speaker = pickSpeaker(state, entry.playerId);
    if (!speaker) return entries;
    const category = kind === 'fortuneGood' ? 'compliment' : 'sympathy';
    const said = say(state, speaker, category, { player: actorName }, entry.playerId);
    if (said) entries.push(said);
    return entries;
  }

  if (kind === 'objectiveMet') {
    if (!rollChance(REACT_CHANCE.objectiveMet)) return entries;
    const speaker = pickSpeaker(state, entry.playerId);
    if (!speaker) return entries;
    const category = rollChance(0.3) ? 'challenge' : 'compliment';
    const said = say(state, speaker, category, { player: actorName }, entry.playerId);
    if (said) entries.push(said);
    return entries;
  }

  if (kind === 'leadChange') {
    if (!rollChance(REACT_CHANCE.leadChange)) return entries;
    const newLeader = entry.playerId ? state.players.find((p) => p.id === entry.playerId) : null;
    if (!newLeader) return entries;
    const speaker = pickSpeaker(state, newLeader.id);
    if (!speaker) return entries;
    if (newLeader.type === 'human') {
      const category = pickRandom(['challenge', 'tease']);
      const said = say(state, speaker, category, { player: newLeader.name }, newLeader.id);
      if (said) entries.push(said);
    } else {
      // A robot took the lead — another bot gets a quick word about it.
      const said = say(state, speaker, 'botBanter', { bot: newLeader.name }, newLeader.id);
      if (said) entries.push(said);
    }
    return entries;
  }

  if (kind === 'endTurn') {
    if (!rollChance(REACT_CHANCE.endTurn)) return entries;
    const newActive = entry.playerId ? state.players.find((p) => p.id === entry.playerId) : null;
    if (!newActive) return entries;
    const speaker = pickSpeaker(state, newActive.id);
    if (!speaker) return entries;
    if (newActive.type === 'human') {
      const category = pickRandom(['question', 'tease', 'challenge']);
      const said = say(state, speaker, category, { player: newActive.name }, newActive.id);
      if (said) entries.push(said);
    } else {
      // A second robot's turn starting — a quick word from another bot.
      const said = say(state, speaker, 'botBanter', { bot: newActive.name }, newActive.id);
      if (said) entries.push(said);
    }
    return entries;
  }

  if (kind === 'gameover') {
    if (!state.winnerId) return entries;
    const winner = state.players.find((p) => p.id === state.winnerId);
    for (const bot of aiSpeakers(state)) {
      if (!rollChance(REACT_CHANCE.gameover)) continue;
      const said =
        bot.id === state.winnerId
          ? say(state, bot, 'gloat', {})
          : say(state, bot, 'applause', { player: winner?.name || 'the winner' }, state.winnerId);
      if (said) entries.push(said);
    }
    return entries;
  }

  return entries;
}

/**
 * Given the game state (already updated) and the log entries that were
 * just appended to it, return any chat entries the robots want to add in
 * reaction — unstamped (no id/month yet; the caller, reducer.js's
 * appendChat, stamps those the same way it stamps log entries).
 */
export function reactToLogEntries(state, entries) {
  if (!entries || entries.length === 0) return [];
  if (aiSpeakers(state).length === 0) return []; // nobody around who can talk
  const chat = [];
  for (const entry of entries) {
    chat.push(...reactionsForEntry(state, entry));
  }
  return chat;
}

/** Once-per-game opening chatter as the table sits down — every robot gets
 * a chance to introduce itself, in personality order (so it doesn't read
 * as random noise), plus a small chance of an immediate bit of banter. */
export function generateGreeting(state) {
  const speakers = aiSpeakers(state);
  if (speakers.length === 0) return [];
  const entries = [];
  for (const bot of speakers) {
    const said = say(state, bot, 'greeting', {});
    if (said) entries.push(said);
  }
  if (entries.length > 0) maybeBanterFollowup(state, entries, entries[entries.length - 1]);
  return entries;
}

/**
 * Called once per robot turn (see reducer.js's RUN_AI_TURN) — independent
 * of whatever that bot actually did this turn, it gets a small, separate
 * chance at a goof-off sound effect (a fart, a burp, a hype shout, a groan,
 * "take that back!", a cartoon laugh, a screech, a mock-dramatic hero
 * sting — see soundLibrary.js and BOT_PERSONALITIES' sfxPool) and a small
 * chance at an unprompted money/winning catchphrase (BOT_CHAT_LINES'
 * `hype` category). Either, both, or neither can happen on any given turn.
 * A robot with no personalityId (a save from before this feature existed)
 * never rolls either — see aiSpeakers().
 */
export function generateBotTurnFlavor(state, playerId) {
  const bot = state.players.find((p) => p.id === playerId);
  if (!bot || bot.type !== 'ai' || !bot.personalityId) return [];
  const personality = getBotPersonality(bot.personalityId);
  const entries = [];

  if (rollChance(SFX_CHANCE)) {
    const pool = personality.sfxPool?.length > 0 ? personality.sfxPool : DEFAULT_SFX_POOL;
    // Sound effects get the same anti-repeat cooldown as spoken lines — a
    // burp is funny the first time and grating the third, and a
    // personality's pool is small enough that the raw pick repeats often.
    const recent = recentlySaid(state);
    const fresh = pool.filter((id) => !recent.has(SFX_CAPTION[id] || '*makes a noise*'));
    const sfx = pickRandom(fresh.length > 0 ? fresh : pool);
    entries.push({
      speakerId: bot.id,
      speakerName: bot.name,
      speakerAvatar: bot.avatar,
      color: personality.color || null,
      message: SFX_CAPTION[sfx] || '*makes a noise*',
      category: 'sfx',
      sound: sfx,
      turnNo: turnOrdinal(state),
      targetPlayerId: null,
    });
  }

  if (rollChance(HYPE_CHANCE)) {
    const said = say(state, bot, 'hype', {});
    if (said) entries.push(said);
  }

  return entries;
}

/**
 * Build the chat entry for a human-typed message — see reducer.js's
 * SEND_CHAT case, which calls this after already trimming/validating the
 * text (offensive-word check via game/nameFilter.js, length cap). Doesn't
 * touch state; just shapes the entry the same way say() does for bots, so
 * ChatEntryRow doesn't need to special-case where an entry came from.
 */
export function createHumanChatEntry(sender, message, targetPlayerId) {
  return {
    speakerId: sender.id,
    speakerName: sender.name,
    speakerAvatar: sender.avatar,
    color: HUMAN_CHAT_COLOR,
    message,
    category: 'human',
    targetPlayerId: targetPlayerId || null,
  };
}

/**
 * A small chance a robot "replies" after a human sends a chat message.
 * There's no actual language model reading the text — this just picks an
 * in-character line the same way any other reaction does, from whichever
 * bot was targeted (if it was a bot and can talk) or a random one
 * otherwise, so a typed message doesn't just vanish into silence.
 */
export function reactToHumanChat(state, humanEntry) {
  if (!humanEntry || !rollChance(HUMAN_REPLY_CHANCE)) return [];
  const target = humanEntry.targetPlayerId ? state.players.find((p) => p.id === humanEntry.targetPlayerId) : null;
  const speaker = target?.type === 'ai' && target.personalityId ? target : pickSpeaker(state, humanEntry.speakerId);
  if (!speaker) return [];
  const category = pickRandom(['question', 'tease', 'compliment', 'challenge']);
  const said = say(state, speaker, category, { player: humanEntry.speakerName }, humanEntry.speakerId);
  return said ? [said] : [];
}
