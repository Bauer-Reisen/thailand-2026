// Cloudflare Worker: leitet KI-Anfragen der App an die Claude-API weiter.
// Der API-Schlüssel liegt nur hier als Secret (ANTHROPIC_API_KEY), nie in der App.
// Secrets: ANTHROPIC_API_KEY, APP_TOKEN (frei gewähltes Passwort, steht auf den Handys unter „Meine Codes“).
// Variable: ALLOWED_ORIGIN, z. B. https://DEINNAME.github.io

const MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 4000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const cors = {
      'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-app-token'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: { message: 'Nur POST' } }, 405, cors);
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) return json({ error: { message: 'Herkunft nicht erlaubt' } }, 403, cors);
    if (!env.APP_TOKEN || request.headers.get('x-app-token') !== env.APP_TOKEN) return json({ error: { message: 'Falsches Proxy-Passwort' } }, 401, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: { message: 'Ungültige Anfrage' } }, 400, cors); }

    // Nur Modell, Länge und Nachrichten der App durchlassen – kein Missbrauch für andere Zwecke
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: 'low' },
        fallbacks: 'default',
        messages: (body.messages || []).slice(0, 4)
      })
    });
    return new Response(upstream.body, { status: upstream.status, headers: { ...cors, 'content-type': 'application/json' } });
  }
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json' } });
}
