import { useEffect, useState } from 'react';
import {
  answerQuiz, arenaRecord, checkIn, fetchProfiles, listMyChallenges, listMyRoomsBrief, listTopicReplies,
  onlineMembers, replyToTopic, respondToChallenge, todayQuiz, todayTopic, PERSONA_BLURBS, timeAgo, timeUntil,
} from '../lib/arena.js';
import Avatar from '../components/Avatar.jsx';

// The Lobby (blueprint §10): who's at the table, today's topic, the quiz,
// open challenges, games waiting on you, and your streak. Every block loads
// on its own so one slow query never blanks the screen.
export default function Home({ session, profile, onNavigate, onOpenRoom, onProfileChanged }) {
  const isGuest = session.user.is_anonymous;
  const [streak, setStreak] = useState(null);
  const [online, setOnline] = useState([]);
  const [topic, setTopic] = useState(null);
  const [replies, setReplies] = useState([]);
  const [reply, setReply] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [quizResult, setQuizResult] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [people, setPeople] = useState({});
  const [rooms, setRooms] = useState([]);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkIn().then((r) => { setStreak(r); if (r?.awarded) onProfileChanged?.(); }).catch(() => {});
    onlineMembers().then(setOnline).catch(() => {});
    todayTopic().then(async (t) => { setTopic(t); if (t) setReplies(await listTopicReplies(t.id)); }).catch(() => {});
    todayQuiz().then(setQuiz).catch(() => {});
    arenaRecord(session.user.id).then(setRecord).catch(() => {});
    listMyRoomsBrief(session.user.id).then(setRooms).catch(() => {});
    refreshChallenges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id]);

  async function refreshChallenges() {
    try {
      const rows = await listMyChallenges();
      setChallenges(rows);
      setPeople(await fetchProfiles(rows.flatMap((c) => [c.challenger_id, c.challenged_id])));
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitReply(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await replyToTopic(topic.id, reply.trim());
      setReply('');
      setReplies(await listTopicReplies(topic.id));
      onProfileChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function pick(choice) {
    setBusy(true);
    setError(null);
    try {
      const res = await answerQuiz(quiz.id, choice);
      setQuizResult({ ...res, choice });
      setQuiz({ ...quiz, answered: true, my_choice: choice, correct: res.correct, answer_index: res.answer_index, explanation: res.explanation });
      onProfileChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function answerChallenge(id, accept) {
    setBusy(true);
    setError(null);
    try {
      const roomId = await respondToChallenge(id, accept);
      await refreshChallenges();
      if (accept && roomId) onOpenRoom(roomId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const incoming = challenges.filter((c) => c.status === 'pending' && c.challenged_id === session.user.id);
  const outgoing = challenges.filter((c) => c.status === 'pending' && c.challenger_id === session.user.id);
  const yourMove = rooms.filter((r) => r.status === 'active');
  const openRooms = rooms.filter((r) => r.status === 'open');
  const persona = record?.persona;

  return (
    <div className="arena-page va-home">
      <header className="va-hero">
        <div>
          <p className="va-eyebrow">{greeting()}</p>
          <h1>{isGuest ? 'Welcome, guest' : profile?.display_name || 'Welcome'}</h1>
          <p className="subtitle">
            {persona ? (
              <>You play like a <strong>{persona.label}</strong> — {PERSONA_BLURBS[persona.label]}</>
            ) : (
              <>Play your first game and Venture Arena will start reading your style.</>
            )}
          </p>
        </div>
        <div className="va-stat-row">
          <div className="va-stat"><span className="va-stat-num">{streak?.streak ?? profile?.streak_count ?? 0}</span><span className="va-stat-label">day streak</span></div>
          <div className="va-stat"><span className="va-stat-num">{streak?.points_balance ?? profile?.points_balance ?? 0}</span><span className="va-stat-label">Arena Points</span></div>
          <div className="va-stat"><span className="va-stat-num">{record?.rank ?? 'Rookie'}</span><span className="va-stat-label">rank</span></div>
        </div>
      </header>

      {error && <div className="arena-error">{error}</div>}
      {isGuest && (
        <div className="va-notice">
          You're playing as a guest — your history lasts for this session only. <button className="arena-link-button" onClick={() => onNavigate('me')}>Create a free account</button> to keep it.
        </div>
      )}

      <div className="va-grid">
        <section className="arena-panel va-span2">
          <div className="arena-panel-header">
            <h2>Your table</h2>
            <button className="arena-button secondary arena-button-inline" onClick={() => onNavigate('people')}>See everyone</button>
          </div>
          {online.length === 0 ? (
            <p className="arena-muted">Nobody else is online right now. Challenge a friend and they'll get it when they're back.</p>
          ) : (
            <div className="va-people-strip">
              {online.map((m) => (
                <button key={m.id} className="va-person-chip" onClick={() => onNavigate('member', m.id)}>
                  <Avatar profile={m} size={44} online />
                  <span className="va-person-name">{m.display_name}</span>
                  <span className="va-person-sub">{m.persona_label || (m.is_guest ? 'guest' : 'member')}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {(incoming.length > 0 || outgoing.length > 0) && (
          <section className="arena-panel va-span2">
            <h2>Challenges</h2>
            <div className="arena-list">
              {incoming.map((c) => (
                <div className="va-challenge" key={c.id}>
                  <Avatar profile={people[c.challenger_id]} size={36} />
                  <div className="va-challenge-body">
                    <strong>{people[c.challenger_id]?.display_name || 'Someone'}</strong> challenged you to {c.vm_games?.icon} {c.vm_games?.name}
                    {c.message && <div className="va-challenge-msg">“{c.message}”</div>}
                    <div className="arena-muted">expires {timeUntil(c.expires_at)}</div>
                  </div>
                  <div className="va-challenge-actions">
                    <button className="arena-button primary arena-button-inline" disabled={busy} onClick={() => answerChallenge(c.id, true)}>Accept</button>
                    <button className="arena-button secondary arena-button-inline" disabled={busy} onClick={() => answerChallenge(c.id, false)}>Decline</button>
                  </div>
                </div>
              ))}
              {outgoing.map((c) => (
                <div className="va-challenge" key={c.id}>
                  <Avatar profile={people[c.challenged_id]} size={36} />
                  <div className="va-challenge-body">
                    Waiting for <strong>{people[c.challenged_id]?.display_name || 'them'}</strong> to answer your {c.vm_games?.name} challenge
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(yourMove.length > 0 || openRooms.length > 0) && (
          <section className="arena-panel">
            <h2>Your games</h2>
            <div className="arena-list">
              {yourMove.map((r) => (
                <button key={r.id} className="arena-list-row" onClick={() => onOpenRoom(r.invite_code)}>
                  <div>
                    <div className="arena-list-row-title">{r.name || `Table ${r.invite_code}`} <span className="arena-badge status-active">in play</span></div>
                    <div className="arena-list-row-sub">Continue the game</div>
                  </div>
                  <span className="arena-list-row-arrow">→</span>
                </button>
              ))}
              {openRooms.map((r) => (
                <button key={r.id} className="arena-list-row" onClick={() => onOpenRoom(r.invite_code)}>
                  <div>
                    <div className="arena-list-row-title">{r.name || `Table ${r.invite_code}`} <span className="arena-badge status-open">seating</span></div>
                    <div className="arena-list-row-sub">Waiting for players</div>
                  </div>
                  <span className="arena-list-row-arrow">→</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="arena-panel va-play-cta">
          <h2>Get in the game</h2>
          <p className="arena-muted">VentureFlow is live: build a portfolio, race the clock, out-invest the table. 5–20 minutes with friends or AI.</p>
          <button className="arena-button primary" onClick={() => onNavigate('play')}>Play VentureFlow</button>
        </section>

        {topic && (
          <section className="arena-panel va-span2 va-topic">
            <p className="va-eyebrow">Topic of the day · {topic.theme}</p>
            <h2>{topic.title}</h2>
            <p className="va-topic-prompt">{topic.prompt}</p>
            <div className="va-replies">
              {replies.map((r) => (
                <div className="va-reply" key={r.id}>
                  <Avatar profile={r.vm_profiles} size={28} />
                  <div>
                    <span className="va-reply-name">{r.vm_profiles?.display_name || 'Member'}</span>
                    <span className="arena-muted"> · {timeAgo(r.created_at)}</span>
                    <div>{r.body}</div>
                  </div>
                </div>
              ))}
              {replies.length === 0 && <p className="arena-muted">No takes yet — be the first.</p>}
            </div>
            {isGuest ? (
              <p className="arena-muted">Create a free account to join the conversation.</p>
            ) : (
              <form className="arena-inline-form" onSubmit={submitReply}>
                <input className="arena-field" placeholder="Your take (earns 5 points)" value={reply} maxLength={1000} onChange={(e) => setReply(e.target.value)} />
                <button className="arena-button primary arena-button-inline" type="submit" disabled={busy || !reply.trim()}>Post</button>
              </form>
            )}
          </section>
        )}

        {quiz && (
          <section className="arena-panel va-quiz">
            <p className="va-eyebrow">Daily quiz · {quiz.theme}</p>
            <h2>{quiz.question}</h2>
            <div className="va-quiz-options">
              {quiz.options.map((opt, i) => {
                const answered = quiz.answered;
                const cls = answered
                  ? i === quiz.answer_index ? 'correct' : i === quiz.my_choice ? 'wrong' : 'muted'
                  : '';
                return (
                  <button key={i} type="button" className={`va-quiz-option ${cls}`} disabled={answered || busy} onClick={() => pick(i)}>
                    <span className="va-quiz-letter">{String.fromCharCode(65 + i)}</span> {opt}
                  </button>
                );
              })}
            </div>
            {quiz.answered && (
              <p className="va-quiz-explain">
                <strong>{quiz.correct ? 'Correct.' : 'Not quite.'}</strong> {quiz.explanation}
                {quizResult?.awarded && <span className="arena-muted"> +{quizResult.correct ? 10 : 3} points</span>}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
