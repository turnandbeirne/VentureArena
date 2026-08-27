import { useEffect, useRef } from 'react';
import { playSound } from '../audio/soundEngine';

/**
 * Reactive sound layer for the bot chat feed — mirrors useGameSounds.js's
 * approach, but for state.chat instead of state.log. Every newly-appended
 * chat entry plays a sound: entries tagged with a `sound` (a SOUNDS key —
 * see game/chatEngine.js's generateBotTurnFlavor(), the goofy fart/burp/
 * laugh/screech/etc. sound-effect moments) play that specific effect;
 * every other entry (an ordinary spoken line) just gets the light generic
 * 'chat' pop so the feed still feels alive without being noisy.
 *
 * Mounted once in App.jsx alongside useGameSounds, so it doesn't matter
 * which screen is showing or who triggered the chat (human's turn, a
 * robot's turn, game start, game over).
 */
export function useChatSounds(chat) {
  const seenCountRef = useRef(null);

  useEffect(() => {
    if (!chat) {
      seenCountRef.current = null;
      return;
    }

    if (seenCountRef.current === null) {
      // Fresh mount (new game or resumed from localStorage) — don't replay
      // the whole history, just start watching from here.
      seenCountRef.current = chat.length;
      return;
    }

    if (chat.length > seenCountRef.current) {
      const newEntries = chat.slice(seenCountRef.current);
      for (const entry of newEntries) {
        playSound(entry.sound || 'chat');
      }
      seenCountRef.current = chat.length;
    } else if (chat.length < seenCountRef.current) {
      seenCountRef.current = chat.length;
    }
  }, [chat]);
}
