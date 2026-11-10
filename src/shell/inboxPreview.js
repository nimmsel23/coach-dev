/** Gemeinsame Anzeige-Helfer für Inbox-Quick-Menü und Sidebar-SubTabs. */

export function inboxPayload(ex) {
  const data = ex?.exercises?.[0] || ex?.enriched || ex || {}
  return {
    ...ex,
    ...data,
    file_id: ex?.file_id || data.file_id || null,
    userId: ex?.userId || data.userId || null,
    status: ex?.status || data.status || null,
    inbox_status: ex?.status || data.status || null,
    inbox_entry: ex,
    enriched: ex?.enriched || data.enriched || null,
  }
}

export function inboxTitle(ex) {
  const data = ex?.exercises?.[0] || ex?.enriched || ex || {}
  return data.display_name || data.name || data.german || data.english || ex?.file_id || 'Anfrage'
}

export function inboxStatus(ex) {
  return String(ex?.status || ex?.inbox_status || ex?.exercises?.[0]?.review_state?.status || 'draft')
}

export function inboxStatusTone(status) {
  if (status === 'ai_enriched' || status === 'approved' || status === 'github_pr') return 'text-fit-accent'
  if (status === 'pending' || status === 'pending_review' || status === 'failed_enrichment' || status === 'pr_draft') return 'text-fit-orange'
  return 'text-fit-dim'
}

export const INBOX_SIDEBAR_LIMIT = 6
