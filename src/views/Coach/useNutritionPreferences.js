import { useEffect, useState } from 'react';
import { auth } from '../../firebase.js';
import { WORKSPACE_API_ORIGIN } from './workspaceApi.js';
import { extractNutritionPreferences } from '../../lib/nutrition/recipeRuns.js';

export function useNutritionPreferences(uid) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ uid, status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const timer = setTimeout(() => controller.abort(), 8000);
    setState({ uid, status: 'loading' });
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Coach-Anmeldung erforderlich.');
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
        const response = await fetch(`${local ? window.location.origin : WORKSPACE_API_ORIGIN}/api/clients/${encodeURIComponent(uid)}/nutrition-preferences`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 404 ? 'Workspace oder Ernährungsregeln noch nicht erreichbar. Zuordnung und Coach-API prüfen.' : 'Ernährungsregeln konnten nicht sicher gelesen werden.');
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Lokale Ernährungsregeln derzeit nicht verfügbar. Verbindung und Coach-Dienst prüfen.');
        const value = await response.json();
        if (typeof value.context !== 'string') throw new Error('Ungültige Workspace-Antwort.');
        if (alive) setState({ uid, status: 'ready', source: value.source, ...extractNutritionPreferences(value.context) });
      } catch (error) {
        if (alive) setState({ uid, status: 'error', error: error.name === 'AbortError' ? 'Lokale Ernährungsregeln nicht erreichbar.' : error.message });
      } finally { clearTimeout(timer); }
    })();
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, [uid, revision]);
  return { ...(state.uid === uid ? state : { status: 'loading' }), retry: () => setRevision((value) => value + 1) };
}
