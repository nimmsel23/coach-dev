/** Local Coach job runtime. No fabricated results and no browser-only approvals. */
async function api(path, body) {
  let res
  try {
    res = await fetch(`/api/csuite${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    })
  } catch {
    throw new Error('Coach-Runtime nicht erreichbar. Lokalen Coach öffnen und erneut versuchen.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new Error(data?.detail || 'Hier ist keine Coach-Runtime verbunden. Aufträge unter http://127.0.0.1:9150/coach/ceo starten.')
  return data
}

export async function runWorkspace(body) {
  return api('/runs', body)
}

export function createJobAdapter(roleId, opts) {
  let items = []
  let mode = 'offline'
  let signature = ''
  function connection(next) {
    mode = next
    opts.onConnection?.(next)
  }
  async function refresh() {
    const data = await api(`/runs?workspaceId=${encodeURIComponent(roleId)}`)
    items = data.runs
    connection('coach')
    const next = JSON.stringify(items)
    if (next !== signature) { signature = next; opts.onQueue?.(items) }
    return items
  }
  return {
    get mode() { return mode },
    async connect() {
      // Keep reconnecting after startup failure, without overlapping requests.
      let polling = false
      const timer = setInterval(async () => {
        if (document.hidden || polling) return
        polling = true
        try { await refresh() } catch { connection('offline') } finally { polling = false }
      }, 2500)
      window.addEventListener('pagehide', () => clearInterval(timer), { once: true })
      try { await refresh(); return { mode } }
      catch (error) { connection('offline'); return { mode, note: error.message } }
    },
    listApprovals: refresh,
    async upsertApproval(item) {
      await api(`/runs/${encodeURIComponent(item.id)}/decision`, {
        expectedRevision: item.revision, status: item.status, preview: item.preview,
      })
      await refresh()
    },
    async removeApproval(id) {
      const item = items.find((row) => row.id === id)
      if (!item) throw new Error('Auftrag bitte neu laden.')
      await api(`/runs/${encodeURIComponent(id)}/decision`, {
        expectedRevision: item.revision, status: 'rejected',
      })
      await refresh()
    },
  }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(String(text || '')); return true } catch { return false }
}
