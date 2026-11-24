export const WORKSPACE_API_ORIGIN = 'https://ideapad.tail7a15d6.ts.net:8443';

export function localWorkspaceUrl(id, location = window.location) {
  const origin = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? location.origin : WORKSPACE_API_ORIGIN;
  const url = new URL('/coach/local.html', origin);
  url.searchParams.set('client', id);
  return url.href;
}

export function localPlanState(plan) {
  if (!(plan.version > 0)) return { id: 'draft', label: 'Lokaler Entwurf' };
  if (plan.deliveredVersion === plan.version) return { id: 'delivered', label: `Lokal V${plan.version} · Versand vermerkt` };
  return { id: 'pending', label: `Lokal V${plan.version} · Übergabe offen` };
}

// LocalPlans.delivery_payload owns this deterministic ID and provenance contract.
// Version equality is deliberately not presented as a content/snapshot comparison.
export function cloudCounterpart(plan, cloud) {
  if (cloud.status !== 'ready') return 'Cloud-Stand nicht bestätigt';
  const remote = cloud.plans.find((item) => item.id === `local-${plan.id}`);
  if (!remote) return 'Kein Cloud-Gegenstück vorhanden';
  if (remote.source !== 'coach-local-plan') return 'Cloud-Zuordnung prüfen · andere Herkunft';
  if (!(remote.sourceLocalVersion > 0)) return 'Cloud-Herkunftsversion fehlt';
  if (remote.sourceLocalVersion !== plan.version) return `Cloud basiert auf lokal V${remote.sourceLocalVersion} · abweichender Versionsstand`;
  return `Cloud basiert auf lokal V${remote.sourceLocalVersion} · Inhalt nicht verglichen`;
}

export async function fetchWorkspaceSummary({ user, origin, signal, fetcher = fetch }) {
  if (!user?.getIdToken) throw new Error('Für lokale Workspaces bitte mit deinem Coach-Konto anmelden.');
  const token = await user.getIdToken();
  const response = await fetcher(`${origin}/api/clients/workspaces`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store', signal,
  });
  if (response.status === 401 || response.status === 403) throw new Error('Workspace-Zugang nicht freigegeben. Coach-Anmeldung und Tailscale prüfen.');
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Workspace-API noch nicht verfügbar.');
  }
  const value = await response.json();
  if (!Array.isArray(value?.workspaces) || !value.workspaces.every((workspace) =>
    typeof workspace?.id === 'string' && typeof workspace.name === 'string'
    && Array.isArray(workspace.uids) && workspace.uids.every((uid) => typeof uid === 'string')
    && Array.isArray(workspace.plans) && workspace.plans.every((plan) => typeof plan?.id === 'string' && typeof plan.name === 'string')
    && typeof workspace.taskwarriorConfigured === 'boolean'
  )) throw new Error('Die Workspace-Antwort ist unvollständig.');
  return value;
}

export function workspaceForUid(workspaces, uid) {
  const matches = workspaces.filter((workspace) => workspace.uids.includes(uid));
  return matches.length === 1 ? { status: 'linked', workspace: matches[0] }
    : { status: matches.length ? 'ambiguous' : 'missing', workspace: null };
}
