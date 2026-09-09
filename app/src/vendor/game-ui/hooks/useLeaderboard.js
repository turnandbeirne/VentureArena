import { useCallback, useState } from 'react';
import { loadLeaderboard, addLeaderboardEntry } from '../game/leaderboard';

export function useLeaderboard() {
  const [entries, setEntries] = useState(loadLeaderboard);

  const addEntry = useCallback((payload) => {
    const result = addLeaderboardEntry(payload);
    setEntries(result.entries);
    // Callers (GameOverScreen) want both the saved entry and its rank, e.g.
    // to celebrate a Top 20 finish — return the entry with rank attached
    // rather than changing this hook's return shape.
    return { ...result.entry, rank: result.rank };
  }, []);

  const refresh = useCallback(() => {
    setEntries(loadLeaderboard());
  }, []);

  return { entries, addEntry, refresh };
}
