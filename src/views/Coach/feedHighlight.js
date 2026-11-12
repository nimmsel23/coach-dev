// Firestore-IDs sind nur innerhalb einer Collection und eines Klienten eindeutig.
export function feedEntryKey(item) {
  return JSON.stringify([item?.userId || '', item?.type || '', item?.id || ''])
}

// Kalendertag aus Feed-Einträgen und Push-Links (#/clients/<uid>?date=YYYY-MM-DD).
// Reine Funktionen, prüfbar mit node --test. Der Tag steht als Präfix im Datum;
// ein UTC-Slice würde ihn in Europa zwischen 00:00 und 01:00 verschieben.

export function normalizeFeedDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

export function feedItemsOnDate(items, highlightDate) {
  const target = normalizeFeedDate(highlightDate)
  if (!target || !Array.isArray(items)) return []
  return items.filter((item) => normalizeFeedDate(item?.date) === target)
}

export function formatFeedDate(value) {
  const iso = normalizeFeedDate(value)
  if (!iso) return String(value ?? '').trim()
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('de-AT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function entryLabel(count) {
  return count === 1 ? 'Ein Eintrag' : `${count} Einträge`
}

export function highlightStatus({ dateLabel, matched, hidden }) {
  const shown = Math.max(0, Number(matched) - Number(hidden))
  const concealed = Math.max(0, Number(hidden) || 0)
  const total = Math.max(0, Number(matched) || 0)
  const verb = (count) => (count === 1 ? 'ist' : 'sind')
  if (total <= 0) return `In den geladenen Einträgen ist nichts vom ${dateLabel}.`
  if (concealed === 0) return `${entryLabel(total)} vom ${dateLabel}.`
  if (shown === 0) {
    return `${entryLabel(concealed)} vom ${dateLabel} ${verb(concealed)} durch den Filter verdeckt.`
  }
  return `${entryLabel(shown)} vom ${dateLabel} sichtbar. ${entryLabel(concealed)} ${verb(concealed)} durch den Filter verdeckt.`
}
