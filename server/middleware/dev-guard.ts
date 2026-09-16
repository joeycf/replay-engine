import { timingSafeEqual } from 'node:crypto';

/**
 * Put a token in front of the /dev surface, so it can be reached from off this
 * machine on purpose and never by accident.
 *
 * WHAT THIS IS FOR. `import.meta.dev` — the guard on all seven repos' dev pages
 * and routes — is a BUILD-MODE CONSTANT, not an access check. It is true for
 * every caller of a `nuxt dev` process, wherever they are. Across the four apps
 * with curation tooling that is 32 dev routes, 11 of which rewrite committed
 * data in the git working tree, with nothing but the listener's bind address
 * between them and any host that can route to the port.
 *
 * It became worth fixing when the work outgrew the desk: the caches these tools
 * read are 58GB (Tōkon) and 101GB (2XKO), so the frames can never leave the
 * machine that holds them, and reviewing from anywhere else means reaching this
 * port from somewhere else.
 *
 *   DEV_REVIEW_TOKEN unset   no change; the bind address is the only control
 *   DEV_REVIEW_TOKEN set     /dev and /api/dev need the token, from any origin
 *
 * THE ADDRESS CANNOT BE CHECKED HERE, AND IT IS WORTH KNOWING WHY. Under
 * `nuxt dev` the request reaches Nitro through the dev proxy with no TCP socket
 * behind it: `event.node.req.socket.remoteAddress` is undefined, and the only
 * client address on offer is `x-forwarded-for`. Measured, that header is passed
 * through from the client verbatim — a request arriving on a LAN interface with
 * `x-forwarded-for: 127.0.0.1` is indistinguishable from a real loopback call.
 * So an "allow loopback, refuse the rest" rule written here would be bypassable
 * with one header, which is worse than no rule because it reads like one.
 *
 * The listener is where that belongs, and the engine sets it: `devServer.host`
 * is '127.0.0.1' in this layer's nuxt.config, so every consuming app binds
 * loopback only unless it deliberately says otherwise. A tunnel still works —
 * `tailscale serve` terminates in the daemon and proxies to localhost — and it
 * is exactly then that the token stops being optional, because from in here a
 * tunnelled request and a desk request are the same request.
 *
 * WHY IT IS HERE AND NOT IN EACH APP. The per-file guard is copy-pasted 47 times
 * across four repos, and NEW-GAME-CHECKLIST.md records what that costs: three
 * Tōkon pages shipped without it because nobody could see the other seven from
 * where they were working. A middleware cannot be forgotten by the next page.
 * This is the engine's documented exception to "no server code in the layer" —
 * see the README. It registers no route and no auto-imported symbol, and under
 * `vercel-static` it is compiled out of the deployed artifact entirely, so the
 * harm that rule protects against does not apply to it.
 *
 * IT DOES NOT MAKE A DEV SERVER SAFE TO PUBLISH. This middleware runs inside
 * Nitro, and Vite answers its own paths before Nitro sees the request. Measured
 * with the token enforced and no credentials: `/_nuxt/@fs/…` returned
 * data/overrides.json in full and served route source code, and Nuxt DevTools
 * answered 200 — while `/dev` correctly 404'd. That is fine on a private tailnet,
 * where only your own devices can resolve the name. It is not fine on anything
 * public (Tailscale Funnel, a Cloudflare quick tunnel, a port forward): there the
 * authentication has to sit IN FRONT of the whole dev server — a proxy that
 * demands credentials before forwarding anything — and the tunnel must publish
 * that proxy, never the dev server's own port. The token is then a second layer
 * over /dev, not the first line.
 *
 * IT GUARDS NOTHING IN PRODUCTION, and must never be sold as if it did. Every
 * app builds `vercel-static`: there is no server in the output at all, and these
 * routes already 404 there by not existing.
 */

/** The whole dev path space, in every consuming app. See below on the prefix. */
const DEV_PREFIXES = ['/dev', '/api/dev'];

/** Constant-time where it can be, and a length check first because
 *  `timingSafeEqual` throws on a mismatch rather than returning false. */
function tokenMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default defineEventHandler((event) => {
  const expected = process.env.DEV_REVIEW_TOKEN?.trim();
  if (!expected) return;

  // Prerender runs this middleware with no client behind it at all. `nitro
  // .prerender.ignore: ['/dev']` already keeps the whole prefix out of every
  // app's static output, so there is nothing to guard here and a 404 would only
  // be a way to fail a build for no reason.
  if (import.meta.prerender) return;

  // THE PATH IS ALREADY BASE-STRIPPED. Middleware mounts at the app's baseURL
  // and h3 slices that off before calling us, so this sees `/api/dev/…` even
  // though the browser asked for `/tokon/api/dev/…`. Matching on the game prefix
  // would therefore match nothing and silently allow everything — the failure
  // that looks exactly like success. The path space is identical in all seven
  // consumers, so the bare prefixes are both sufficient and complete.
  const path = (event.path || '').split('?')[0] ?? '';
  const onDevSurface = DEV_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  if (!onDevSurface) return;

  // A link is the whole login. `?k=` swaps itself for a cookie and redirects, so
  // a device is authorised once per session from the password manager and every
  // later request — including the /dev index's own queue fetches, which swallow
  // failures silently and would otherwise just read "queue unavailable" —
  // carries it without anyone setting a header.
  const query = getQuery(event);
  const fromQuery = typeof query.k === 'string' ? query.k : undefined;
  if (fromQuery && tokenMatches(fromQuery, expected)) {
    setCookie(event, 'dev_review_token', expected, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    // REDIRECT WITH THE BASE BACK ON. `event.path` and `event.node.req.url` are
    // BOTH base-stripped by the time middleware runs — measured, not assumed —
    // so redirecting to either drops the game prefix and lands the browser on
    // `/dev/…`, outside the app, which 404s. `getRequestURL` is the one form
    // that still carries it.
    const url = getRequestURL(event);
    url.searchParams.delete('k');
    return sendRedirect(event, `${url.pathname}${url.search}`, 302);
  }

  if (tokenMatches(getHeader(event, 'x-dev-token'), expected)) return;
  if (tokenMatches(getCookie(event, 'dev_review_token'), expected)) return;

  // 404 rather than 401, matching every existing guard on this surface: it says
  // the tooling is not here, rather than advertising that a secret guards it.
  throw createError({ statusCode: 404, statusMessage: 'Not Found' });
});
