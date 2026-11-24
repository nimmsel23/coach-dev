import { useCallback, useEffect, useState } from 'react';
import { auth } from '../../firebase.js';
import { fetchWorkspaceSummary, WORKSPACE_API_ORIGIN } from './workspaceApi.js';

export function useWorkspaceSummary() {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ status: 'loading', workspaces: [], error: '' });
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    const origin = local ? window.location.origin : WORKSPACE_API_ORIGIN;
    let alive = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    setState({ status: 'loading', workspaces: [], error: '' });
    fetchWorkspaceSummary({ user: auth.currentUser, origin, signal: controller.signal }).then((data) => {
      if (alive) setState({ ...data, status: 'ready', error: '' });
    }).catch((error) => {
      if (alive) setState({ status: 'offline', workspaces: [], error: error instanceof TypeError || error.name === 'AbortError'
        ? 'Lokaler Workspace nicht erreichbar. Laptop und Tailscale müssen verbunden sein.' : error.message });
    }).finally(() => window.clearTimeout(timer));
    return () => { alive = false; controller.abort(); window.clearTimeout(timer); };
  }, [revision]);
  return { ...state, retry };
}
