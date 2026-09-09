import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fails loudly in dev rather than silently making requests to nowhere —
  // see ../../.env.example for what to set.
  // eslint-disable-next-line no-console
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy app/.env.example to app/.env.local and fill them in.');
}

export const supabase = createClient(url, anonKey);

/** Call the resolve-move edge function as the currently signed-in user. This
 * is the ONLY way the app should ever advance a room's game state — see
 * supabase/functions/resolve-move/index.ts for why. */
export async function resolveMove(roomId, action) {
  const { data, error } = await supabase.functions.invoke('resolve-move', {
    body: { roomId, action },
  });
  if (error) throw error;
  return data;
}
