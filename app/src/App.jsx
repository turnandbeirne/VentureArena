import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { getMyProfile, listMyChallenges, touchPresence } from './lib/arena.js';
import Brand from './components/Brand.jsx';
import NavBar from './components/NavBar.jsx';
import AuthScreen from './pages/AuthScreen.jsx';
import Home from './pages/Home.jsx';
import Lobby from './pages/Lobby.jsx';
import People from './pages/People.jsx';
import Tiers from './pages/Tiers.jsx';
import Me from './pages/Me.jsx';
import Member from './pages/Member.jsx';
import RoomScreen from './pages/RoomScreen.jsx';

// Routing is deliberately tiny: five tabs on the path (/, /play, /people,
// /tiers, /me), a member page (/member/<id>), and ?room=<code> on top of any
// of them for an open table — so an invite link keeps working exactly as
// before (see RoomScreen). Railway's `serve -s` rewrites every path to
// index.html, as does app/public/_redirects for other static hosts.
const TAB_PATHS = { home: '/', play: '/play', people: '/people', tiers: '/tiers', me: '/me' };

function readRoute() {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const member = path.match(/^\/member\/([0-9a-f-]{36})$/i);
  const tab = Object.keys(TAB_PATHS).find((k) => TAB_PATHS[k] === path) || (member ? 'member' : 'home');
  return { room: params.get('room') || null, tab, memberId: member ? member[1] : null };
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);
  const [route, setRoute] = useState(readRoute);
  const [pendingChallenges, setPendingChallenges] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      setProfile(await getMyProfile(session.user.id));
    } catch {
      /* profile row appears via trigger a moment after sign-up; the next refresh gets it */
    }
  }, [session?.user?.id]);

  // Profile + presence heartbeat (drives "who's online" everywhere) + the
  // challenge badge on the Home tab. One interval, cleared on sign-out.
  useEffect(() => {
    if (!session) { setProfile(null); return undefined; }
    refreshProfile();
    const beat = async () => {
      touchPresence();
      try {
        const rows = await listMyChallenges();
        setPendingChallenges(rows.filter((c) => c.status === 'pending' && c.challenged_id === session.user.id).length);
      } catch { /* ignore */ }
    };
    beat();
    const id = setInterval(beat, 60 * 1000);
    const onFocus = () => beat();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [session, refreshProfile]);

  function push(url) {
    window.history.pushState({}, '', url);
    setRoute(readRoute());
    window.scrollTo(0, 0);
  }

  function navigate(tab, arg) {
    if (tab === 'member' && arg) return push(`/member/${arg}`);
    return push(TAB_PATHS[tab] || '/');
  }

  function openRoom(identifier) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', identifier);
    push(url.pathname + url.search);
  }

  function leaveRoom() {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    push(url.pathname + url.search);
  }

  if (session === undefined) return null; // brief flash guard while the session loads
  if (!session) {
    return (
      <>
        <Brand />
        <AuthScreen />
      </>
    );
  }

  const inRoom = Boolean(route.room);
  let screen;
  if (inRoom) {
    screen = <RoomScreen session={session} roomParam={route.room} onLeave={leaveRoom} />;
  } else if (route.tab === 'member') {
    screen = <Member session={session} userId={route.memberId} onBack={() => window.history.length > 1 ? window.history.back() : navigate('people')} />;
  } else if (route.tab === 'play') {
    screen = <Lobby session={session} profile={profile} onOpenRoom={openRoom} onNavigate={navigate} />;
  } else if (route.tab === 'people') {
    screen = <People session={session} onNavigate={navigate} onOpenRoom={openRoom} />;
  } else if (route.tab === 'tiers') {
    screen = <Tiers session={session} profile={profile} />;
  } else if (route.tab === 'me') {
    screen = <Me session={session} profile={profile} onProfileChanged={refreshProfile} onNavigate={navigate} />;
  } else {
    screen = <Home session={session} profile={profile} onNavigate={navigate} onOpenRoom={openRoom} onProfileChanged={refreshProfile} />;
  }

  return (
    <div className={`va-app ${inRoom ? 'in-room' : ''}`}>
      {!inRoom && <Brand compact />}
      {!inRoom && <NavBar current={route.tab} onNavigate={navigate} badges={{ home: pendingChallenges }} />}
      <main className="va-main">{screen}</main>
    </div>
  );
}
