// ============================================================================
// send-recap-email — actually sends the game recap by email
// ----------------------------------------------------------------------------
// Replaces the old `mailto:` "Email Recap" button (GameOverScreen.jsx),
// which silently did nothing on any device without a configured default
// mail client — that's the bug Michael reported. This function sends a
// real email, from a venturemaker.org address, via Resend's API.
//
// Deployed in the SAME Supabase project VentureFlow's global leaderboard
// and VentureMaker Arena already use (iwpysmrmunirsvdrecmw /
// opportunity-engines-platform — see vf-source-snapshot-2026-08-23.md and
// round-5-pre-multiplayer.md for why this project, not a dedicated one).
//
// Deliberately PUBLIC (verify_jwt: false) — VentureFlow standalone has no
// auth system at all (see globalLeaderboard.js's plain-fetch pattern; the
// whole app is designed to work signed-out), and this button needs to work
// there too, not just from Arena's authenticated rooms. Because it's
// public, the request body is intentionally narrow: a caller can only ever
// trigger ONE canned template (this file's own copy, not arbitrary text)
// addressed to a recipient THEY choose, containing a link THEY generated
// client-side — never free-form subject/body content. That bounds the
// abuse surface to "can email a recap link to an address," not "can send
// arbitrary mail through venturemaker.org." There is no rate limiting yet
// (would need a persistent store — vm_app_config could grow into one, but
// that's future work, not part of this pass); keep an eye on Resend's
// dashboard for unexpected volume.
//
// Setup this function depends on (see README's "Real email sending" note):
//   1. A Resend account (resend.com), free tier is enough for this volume.
//   2. venturemaker.org verified as a sending domain in Resend (Resend
//      gives you the exact DNS records to add).
//   3. An API key from Resend, set as this project's RESEND_API_KEY
//      secret — `supabase secrets set RESEND_API_KEY=re_xxx
//      --project-ref iwpysmrmunirsvdrecmw`, or via the Supabase dashboard
//      (Project Settings -> Edge Functions -> Secrets). This function
//      never sees that key in code — it only reads it from the runtime
//      environment.
//   4. Default sender is build@venturemaker.org (venturemaker.org is
//      verified in Resend as of 2026-08-26). Optionally set
//      RESEND_FROM_ADDRESS to override without redeploying — must be an
//      address on the verified domain.
// Until steps 1-3 are done, this function returns a clear 503 with a
// human-readable reason instead of a confusing generic failure, and the
// client-side button falls back to suggesting "Copy Recap Link" instead.
// ============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only ever mail a link back to one of OUR OWN deployed recap pages — not
// an arbitrary attacker-supplied URL — so this can't be repurposed as a
// generic "send this link to anyone" spam relay. Covers both apps' known
// hosts plus localhost for local testing; add a new host here if either
// app moves domains.
const ALLOWED_RECAP_HOSTS = [
  'venturemaker.org',
  'www.venturemaker.org',
  'arena-web-production-6e64.up.railway.app',
  'localhost',
];

function isAllowedRecapUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 4000) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return false;
  if (!ALLOWED_RECAP_HOSTS.includes(url.hostname)) return false;
  if (!url.pathname.replace(/\/+$/, '').endsWith('/recap')) return false;
  return true;
}

// Minimal HTML-escaping for the few caller-supplied strings (names) that
// get interpolated into the email body — nothing here is rich text, so
// this is just enough to stop a player named `<script>` from doing
// anything odd in an HTML email client.
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return json(
      { error: 'Email sending is not set up yet — RESEND_API_KEY is missing. Try "Copy Recap Link" instead for now.' },
      503,
    );
  }

  let body: { to?: unknown; recapUrl?: unknown; winnerName?: unknown; scenarioName?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }

  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!to || to.length > 254 || !EMAIL_RE.test(to)) {
    return json({ error: 'A valid recipient email is required' }, 400);
  }
  if (!isAllowedRecapUrl(body.recapUrl)) {
    return json({ error: 'recapUrl must be a link to this app\'s own /recap page' }, 400);
  }
  const recapUrl = body.recapUrl as string;
  const winnerName = typeof body.winnerName === 'string' ? body.winnerName.trim().slice(0, 60) : '';
  const scenarioName = typeof body.scenarioName === 'string' ? body.scenarioName.trim().slice(0, 60) : '';

  const from = Deno.env.get('RESEND_FROM_ADDRESS') || 'VentureMaker <build@venturemaker.org>';
  const subject = winnerName ? `VentureFlow recap — ${winnerName}'s game` : 'Your VentureFlow game recap';
  const text = `Here's how the VentureFlow game went${scenarioName ? ` (${scenarioName})` : ''} — final standings, what came up, and a few notes on how it played out:\n\n${recapUrl}\n\nNo account or app needed, just open the link.`;
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #2b2320;">
      <h2 style="margin-bottom: 0.25rem;">🏁 VentureFlow recap</h2>
      <p>Here's how the game went${scenarioName ? ` (<strong>${escapeHtml(scenarioName)}</strong>)` : ''}${
        winnerName ? ` — <strong>${escapeHtml(winnerName)}</strong> came out on top` : ''
      } — final standings, what came up, and a few notes on how it played out.</p>
      <p style="margin: 1.25rem 0;">
        <a href="${recapUrl}" style="background:#2f9e44; color:#fff; padding:0.65rem 1.1rem; border-radius:8px; text-decoration:none; font-weight:600;">
          Open the recap
        </a>
      </p>
      <p style="font-size: 0.85rem; color: #6b6259;">No account or app needed — the link opens straight to the recap page.</p>
    </div>
  `;

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });

  if (!resendResp.ok) {
    const detail = await resendResp.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.error('Resend send failed', resendResp.status, detail);
    return json({ error: 'The email could not be sent. Try "Copy Recap Link" instead.' }, 502);
  }

  return json({ ok: true });
});
