import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import * as integration from '../../strava-integration.mjs';

// Local trusted-user API. UID selects storage; it is not public authentication.
export function stravaRoutes({ usersRoot, log, api = integration }) {
  const router = new Hono();
  const pending = new Map();
  const ttl = 10 * 60 * 1000;
  const cookieName = 'fitness-strava-state';
  const redirectUri = c => `${new URL(c.req.url).origin}/tours/strava/callback`;
  const dataDir = uid => path.join(usersRoot, uid, 'fitness');

  router.use('*', async (c, next) => {
    if (c.req.path.endsWith('/callback')) return next();
    const uid = c.req.query('uid') || c.req.header('x-user-uid');
    if (!uid || !/^[\w-]{1,128}$/.test(uid)) return c.json({ ok: false, error: 'explicit valid uid required' }, 400);
    c.set('uid', uid);
    return next();
  });
  router.get('/status', c => c.json({ ok: true, ...api.stravaStatus(dataDir(c.get('uid'))) }));
  router.get('/authorize', c => {
    try {
      for (const [key, value] of pending) if (value.expires <= Date.now()) pending.delete(key);
      const state = randomBytes(32).toString('hex');
      const url = new URL(api.buildAuthorizeUrl(redirectUri(c)));
      url.searchParams.set('state', state);
      pending.set(state, { uid: c.get('uid'), expires: Date.now() + ttl });
      setCookie(c, cookieName, state, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/tours/strava', maxAge: ttl / 1000 });
      return c.redirect(url.toString());
    } catch (err) { return c.json({ ok: false, error: err.message }, 400); }
  });
  router.get('/callback', async c => {
    const state = c.req.query('state');
    const request = pending.get(state);
    if (!request || request.expires <= Date.now() || getCookie(c, cookieName) !== state) {
      return c.json({ ok: false, error: 'invalid or expired OAuth state; reconnect Strava' }, 400);
    }
    pending.delete(state);
    deleteCookie(c, cookieName, { path: '/tours/strava' });
    const error = c.req.query('error');
    if (error) return c.redirect(`/#tours?strava_error=${encodeURIComponent(error)}`);
    const code = c.req.query('code');
    if (!code) return c.json({ ok: false, error: 'missing OAuth code' }, 400);
    try {
      await api.exchangeCodeForTokens({ dataDir: dataDir(request.uid), code, redirectUri: redirectUri(c) });
      return c.redirect('/#tours?strava_connected=1');
    } catch (err) {
      log.error({ err }, '[strava] Token-Exchange fehlgeschlagen');
      return c.redirect(`/#tours?strava_error=${encodeURIComponent(err.message)}`);
    }
  });
  router.get('/activities', async c => {
    try {
      const tours = await api.fetchStravaTours({ dataDir: dataDir(c.get('uid')), perPage: Number(c.req.query('per_page') || 30) });
      return c.json({ ok: true, tours });
    } catch (err) { return c.json({ ok: false, error: err.message }, 400); }
  });
  router.post('/disconnect', c => {
    api.disconnectStrava(dataDir(c.get('uid')));
    return c.json({ ok: true });
  });
  return router;
}
