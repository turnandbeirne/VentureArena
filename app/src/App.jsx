import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient.js';
import Brand from './components/Brand.jsx';
import AuthScreen from './pages/AuthScreen.jsx';
import Lobby from './pages/Lobby.jsx';
import RoomScreen from './pages/RoomScreen.jsx';

function readRoomParamFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || null;
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  // Either a room UUID or an invite_code — RoomScreen resolves either.
  // Kept in the URL (?room=...) so an invite link is directly shareable.
  const [roomParam, setRoomParam] = useState(readRoomParamFromUrl);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onPopState = () => setRoomParam(readRoomParamFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function openRoom(identifier) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', identifier);
    window.history.pushState({}, '', url);
    setRoomParam(identifier);
  }

  function backToLobby() {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.pushState({}, '', url);
    setRoomParam(null);
  }

  if (session === undefined) return null; // brief flash guard while the session loads
  return (
    <>
      <Brand />
      {!session ? (
        <AuthScreen />
      ) : roomParam ? (
        <RoomScreen session={session} roomParam={roomParam} onLeave={backToLobby} />
      ) : (
        <Lobby session={session} onOpenRoom={openRoom} />
      )}
    </>
  );
}
