// TrueStrike egress relay: proxies requests to the Juice Shop quick-tunnel so
// the Daytona sandbox (whose egress allowlist includes *.workers.dev) can
// reach a target that only exists on the operator's machine.
// Chain: sandbox -> *.workers.dev (allowlisted) -> CF edge -> trycloudflare
// tunnel -> localhost:3000.
//
// The tunnel hostname is provided via the TUNNEL_URL secret (see wrangler.toml).

export default {
  async fetch(request, env) {
    const tunnelUrl = env.TUNNEL_URL;
    if (!tunnelUrl) {
      return new Response('TUNNEL_URL not configured (wrangler secret put TUNNEL_URL)', {
        status: 503,
      });
    }

    const target = new URL(tunnelUrl);
    if (target.protocol !== 'https:') {
      return new Response('TUNNEL_URL must be https', { status: 500 });
    }

    const upstream = new URL(request.url);
    upstream.protocol = target.protocol;
    upstream.hostname = target.hostname;
    upstream.port = target.port;

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ray');
    headers.delete('cf-visitor');
    headers.delete('cdn-loop');

    return fetch(upstream, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
  },
};
