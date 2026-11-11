import test from 'node:test'
import assert from 'node:assert/strict'
import { feedItemsOnDate, formatFeedDate, highlightStatus, normalizeFeedDate } from './feedHighlight.js'

test('normalizeFeedDate nimmt den Kalendertag vom Präfix', () => {
  assert.equal(normalizeFeedDate('2026-11-10'), '2026-11-10')
  assert.equal(normalizeFeedDate('2026-11-10T23:30:00.000Z'), '2026-11-10')
  assert.equal(normalizeFeedDate(' Unbekannt '), '')
  assert.equal(normalizeFeedDate(''), '')
  assert.equal(normalizeFeedDate(null), '')
})

test('feedItemsOnDate trifft Workout und Journal desselben Tags', () => {
  const items = [
    { id: 'w', date: '2026-11-10', type: 'workout' },
    { id: 'j', date: '2026-11-10T08:00:00', type: 'journal' },
    { id: 'older', date: '2026-11-08', type: 'workout' },
    { id: 'blank', date: 'Unbekannt', type: 'workout' },
  ]
  assert.deepEqual(feedItemsOnDate(items, '2026-11-10').map((item) => item.id), ['w', 'j'])
  assert.deepEqual(feedItemsOnDate(items, 'kein-datum'), [])
  assert.deepEqual(feedItemsOnDate(null, '2026-11-10'), [])
})

test('formatFeedDate bleibt ein Kalendertag ohne UTC-Verschiebung', () => {
  assert.equal(formatFeedDate('2026-11-10'), '10. November 2026')
  assert.equal(formatFeedDate('Unbekannt'), 'Unbekannt')
})

test('highlightStatus unterscheidet fehlend, sichtbar und verdeckt', () => {
  const dateLabel = '10. November 2026'
  assert.equal(
    highlightStatus({ dateLabel, matched: 0, hidden: 0 }),
    'In den geladenen Einträgen ist nichts vom 10. November 2026.',
  )
  assert.equal(highlightStatus({ dateLabel, matched: 1, hidden: 0 }), 'Ein Eintrag vom 10. November 2026.')
  assert.equal(highlightStatus({ dateLabel, matched: 2, hidden: 0 }), '2 Einträge vom 10. November 2026.')
  assert.equal(
    highlightStatus({ dateLabel, matched: 2, hidden: 2 }),
    '2 Einträge vom 10. November 2026 sind durch den Filter verdeckt.',
  )
  assert.equal(
    highlightStatus({ dateLabel, matched: 3, hidden: 1 }),
    '2 Einträge vom 10. November 2026 sichtbar. Ein Eintrag ist durch den Filter verdeckt.',
  )
})
