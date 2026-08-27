import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchGlobalScores,
  submitGlobalScore,
  isGlobalLeaderboardEnabled,
} from '../game/globalLeaderboard';

/**
 * React glue for the shared leaderboard. Mirrors useLeaderboard's shape so
 * the two boards can be rendered by the same component with a tab between
 * them, but it's asynchronous and can fail, so it also reports `loading` and
 * `error`.
 *
 * `enabled` lets a caller mount the hook without fetching — the leaderboard
 * modal only loads the global tab when that tab is actually opened, rather
 * than firing a network request every time somebody glances at their own
 * local scores.
 */
export function useGlobalLeaderboard({ dailyChallengeDate = null, enabled = true } = {}) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Guards against a slow response from a previous query overwriting a
  // newer one (switching between the all-time and daily boards quickly).
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!isGlobalLeaderboardEnabled()) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(false);
    const rows = await fetchGlobalScores({ dailyChallengeDate });
    if (requestId !== requestRef.current) return;
    if (rows === null) {
      setError(true);
      setEntries([]);
    } else {
      setEntries(rows);
    }
    setLoading(false);
  }, [dailyChallengeDate]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
  }, [enabled, refresh]);

  const submit = useCallback(
    async (entry) => {
      const saved = await submitGlobalScore(entry);
      if (saved) refresh();
      return saved;
    },
    [refresh]
  );

  return {
    entries,
    loading,
    error,
    available: isGlobalLeaderboardEnabled(),
    refresh,
    submit,
  };
}
