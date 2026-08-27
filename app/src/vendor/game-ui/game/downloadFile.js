// Tiny client-side "save this as a file" helper — Blob + a throwaway object
// URL + a synthetic <a download> click, no server round trip and no library.
// Used by the Score/Ledger/Play-by-Play export buttons (GameOverScreen,
// LedgerModal) so a family or classroom can keep a plain-text record of a
// finished game outside the browser — print it, email it, whatever.
//
// Ported verbatim from VentureFlow's own src/game/downloadFile.js — this is
// pure client-side UI logic with no game-state dependency, so it needed no
// import-path changes to work here.
export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on a delay, not immediately — Safari has been known to cancel
  // the download if the object URL disappears before the click finishes
  // processing.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A safe-ish filename fragment from free text (a player or game name) —
 * lowercase, alphanumerics and hyphens only, never empty. */
export function slugForFilename(text) {
  const slug = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'ventureflow';
}
