// Hash-Routing der Coach-Konsole (coach.html, Hosting-Site vos-coach).
//
//   #/exercises                      Übungsanfragen
//   #/catalog                        Katalog Browser
//   #/clients                        Klientenliste
//   #/clients/<uid>/<detail>?date=   Klient mit Detail-Tab (Standard: workouts)
//
// Reine Funktionen ohne React, damit sie mit `node --test` prüfbar sind.
// Der Hash ist das, was functions/clientWorkout.js in die Push-Links schreibt.

export const SUB_TAB_IDS = ['exercises', 'catalog', 'clients']
export const DETAIL_TAB_IDS = ['workouts', 'insights', 'habits', 'templates', 'trainingplan', 'plan']

const DEFAULT_ROUTE = { sub: 'exercises', client: '', detail: 'workouts', date: '' }

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

export function parseCoachHash(hash = '') {
  const raw = String(hash).replace(/^#\/?/, '')
  const [pathPart = '', queryPart = ''] = raw.split('?')
  const segments = pathPart.split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s) } catch { return s }
  })
  const params = new URLSearchParams(queryPart)
  const date = isIsoDate(params.get('date')) ? params.get('date') : ''

  const [first, second, third] = segments
  if (first === 'clients') {
    return {
      sub: 'clients',
      client: second || '',
      detail: DETAIL_TAB_IDS.includes(third) ? third : DEFAULT_ROUTE.detail,
      date,
    }
  }
  if (SUB_TAB_IDS.includes(first)) return { ...DEFAULT_ROUTE, sub: first }

  // Älterer Push-Link: #/coach?client=<uid>&date=<datum>
  if (first === 'coach' && params.get('client')) {
    return { sub: 'clients', client: params.get('client'), detail: 'workouts', date }
  }
  return { ...DEFAULT_ROUTE }
}

export function buildCoachHash({ sub, client, detail, date } = {}) {
  const route = { ...DEFAULT_ROUTE, sub, client, detail, date }
  if (!SUB_TAB_IDS.includes(route.sub)) return '#/exercises'
  if (route.sub !== 'clients') return `#/${route.sub}`
  if (!route.client) return '#/clients'
  const base = `#/clients/${encodeURIComponent(route.client)}`
  const withDetail = route.detail !== DEFAULT_ROUTE.detail && DETAIL_TAB_IDS.includes(route.detail)
    ? `${base}/${route.detail}`
    : base
  return isIsoDate(route.date) ? `${withDetail}?date=${route.date}` : withDetail
}
