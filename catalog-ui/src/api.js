// Same-origin in Prod (api.py served dist/) und lokal (Vite-Proxy) — kein Prefix nötig.
// Hinter dem Tailscale Funnel liegt die UI unter /fitness-catalog/ (das Backend
// schreibt diesen Pfad intern auf /catalog-ui/ um), API-Routen liegen auf dem
// Backend aber an der Wurzel — absolute Pfade wie /health träfen dort sonst wieder
// den /catalog-ui-Catchall. /fitness-api/ ist die separate, unrewrittene Funnel-
// Route direkt auf denselben Backend-Root (:9150) — dorthin umleiten, wenn wir
// unter dem /fitness-catalog-Mount laufen.
export const API_BASE = window.location.pathname.startsWith('/fitness-catalog')
  ? '/fitness-api'
  : '';

export async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
