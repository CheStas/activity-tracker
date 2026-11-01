// Cloudflare Pages Function: POST /api/feedback from the app's feedback form (src/ui/feedback.tsx). Each message is
// stored in the KV namespace bound as FEEDBACK (Pages → Settings → Bindings), keyed by time, and kept until deleted.
// Read them in the dashboard (Workers & Pages → KV) or with `wrangler kv key list --binding FEEDBACK`.
// Nothing else is stored: no IP address, no country, no cookie.

/** The part of Cloudflare's KVNamespace this uses. */
interface Kv {
  put(key: string, value: string): Promise<void>;
}

interface Context {
  request: Request;
  env: { FEEDBACK?: Kv };
}

const MAX_BODY = 16_000; // bytes
const LIMITS = { message: 4000, email: 200, version: 40, browser: 400 };

const reply = (status: number, error?: string) =>
  new Response(JSON.stringify(error ? { error } : { ok: true }), { status, headers: { 'content-type': 'application/json' } });

/** A trimmed string field, '' when missing; null when it is not a string or too long. */
function field(body: Record<string, unknown>, key: keyof typeof LIMITS): string | null {
  const value = body[key] ?? '';
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length <= LIMITS[key] ? text : null;
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  if (!env.FEEDBACK) return reply(503, 'Feedback is not set up');
  // Only the site's own pages (browsers send Origin on cross-site POSTs).
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply(403, 'Wrong origin');
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'JSON only');

  const raw = await request.text();
  if (raw.length > MAX_BODY) return reply(413, 'Too long');
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, 'Not JSON');
  }
  if (!body || typeof body !== 'object') return reply(400, 'Not an object');
  // The honeypot field: people never see it, bots fill it in. Pretend it worked.
  if (body.website) return reply(200);

  const message = field(body, 'message');
  const email = field(body, 'email');
  const version = field(body, 'version');
  const browser = field(body, 'browser');
  if (!message) return reply(400, 'A message is required');
  if (email === null || version === null || browser === null) return reply(400, 'A field is too long');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, 'Not an email address');

  const at = new Date().toISOString();
  await env.FEEDBACK.put(`${at}-${crypto.randomUUID().slice(0, 8)}`, JSON.stringify({ at, message, email, version, browser }));
  return reply(200);
}
