// node --test src/views/Logbuch/logbookStats.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLogbook, weekWindow, weeklyIntensity, mondayOf, isoWeekNumber, fmtTop, fmtAgo,
} from './logbookStats.js';

const bench = (date, sets, extra = {}) => ({
  date, block: 'Push',
  exercises: [{ exercise_id: 'bench', name: 'Bankdrücken', setsArray: sets, ...extra }],
});

test('zuletzt, Gipfel und Abstand', () => {
  const book = buildLogbook([
    bench('2026-09-01', [{ reps: '5', weight: '80' }]),
    bench('2026-09-08', [{ reps: '5', weight: '90' }, { reps: '3', weight: '70' }]),
    bench('2026-09-15', [{ reps: '5', weight: '85' }]),
  ], '2026-09-20');
  const ex = book.byKey.get('id:bench');
  assert.equal(ex.count, 3);
  assert.equal(ex.mode, 'load');
  assert.equal(ex.peak.date, '2026-09-08');
  assert.equal(ex.last.date, '2026-09-15');
  assert.equal(fmtTop(ex.peak, 'load'), '90 kg × 5');
  assert.ok(Math.abs(ex.gap - (1 - 85 / 90)) < 1e-9);
  assert.equal(ex.status, 'nah');
  assert.equal(ex.dormant, false);
});

test('Rekorde: Erstbesteigung, echter Rekord, Rauschen zählt nicht', () => {
  const book = buildLogbook([
    bench('2026-09-01', [{ reps: '5', weight: '80' }]),
    bench('2026-09-08', [{ reps: '5', weight: '80.2' }]), // +0,25 % → kein Rekord
    bench('2026-09-15', [{ reps: '5', weight: '85' }]),
  ], '2026-09-20');
  const kinds = book.byKey.get('id:bench').records.map((r) => r.kind);
  assert.deepEqual(kinds, ['erst', 'rekord']);
  assert.equal(book.kpis.recordsTotal, 1);
  assert.equal(book.kpis.records30, 1);
});

test('Körpergewicht-Übung wird über Wiederholungen gewertet', () => {
  const pull = (date, reps) => ({ date, block: 'Pull', exercises: [{ name: 'Klimmzug', setsArray: [{ reps, weight: '' }] }] });
  const ex = buildLogbook([pull('2026-09-01', '6'), pull('2026-09-08', '9'), pull('2026-09-15', '8')], '2026-09-16').byKey.get('n:klimmzug');
  assert.equal(ex.mode, 'reps');
  assert.equal(ex.peak.maxReps, 9);
  assert.equal(fmtTop(ex.last, 'reps'), '8 Wdh.');
});

test('Alt-Format sets/reps/weight und Aufwärmsätze', () => {
  const book = buildLogbook([
    { date: '2026-09-01', exercises: [{ name: 'Kniebeuge', sets: '3', reps: '5', weight: '100' }] },
    { date: '2026-09-08', exercises: [{ name: 'Kniebeuge', setsArray: [{ reps: '10', weight: '40', setType: 'warmup' }, { reps: '5', weight: '102.5' }] }] },
  ], '2026-09-09');
  const ex = book.byKey.get('n:kniebeuge');
  assert.equal(ex.first.setCount, 3);
  assert.equal(ex.last.setCount, 1); // Aufwärmsatz ignoriert
  assert.equal(ex.peak.date, '2026-09-08');
});

test('mehrere Docs am selben Tag werden zusammengelegt, leere Sätze ignoriert', () => {
  const book = buildLogbook([
    bench('2026-09-01', [{ reps: '5', weight: '80' }]),
    bench('2026-09-01', [{ reps: '5', weight: '82.5' }, { reps: '', weight: '' }]),
  ], '2026-09-02');
  const ex = book.byKey.get('id:bench');
  assert.equal(ex.count, 1);
  assert.equal(ex.first.setCount, 2);
  assert.equal(book.dayRows.length, 1);
});

test('schläft nach 42 Tagen, leere Eingabe crasht nicht', () => {
  const ex = buildLogbook([bench('2026-01-01', [{ reps: '5', weight: '80' }])], '2026-09-01').byKey.get('id:bench');
  assert.equal(ex.dormant, true);
  assert.equal(ex.status, 'neu');
  const empty = buildLogbook([], '2026-09-01');
  assert.equal(empty.exercises.length, 0);
  assert.equal(empty.kpis.trainingDays, 0);
});

test('Rhythmus-Raster markiert die Gipfel-Woche', () => {
  const book = buildLogbook([
    bench('2026-09-01', [{ reps: '5', weight: '80' }]),
    bench('2026-09-08', [{ reps: '5', weight: '90' }]),
  ], '2026-09-14');
  const weeks = weekWindow('2026-09-14', 4);
  assert.deepEqual(weeks, ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14']);
  const cells = weeklyIntensity(book.byKey.get('id:bench'), weeks);
  assert.equal(cells.find((c) => c.isPeak).week, '2026-09-07');
  assert.ok(cells.find((c) => c.week === '2026-08-31').ratio < 1);
});

test('Datums-Helfer', () => {
  assert.equal(mondayOf('2026-09-13'), '2026-09-07'); // Sonntag → Montag davor
  assert.equal(mondayOf('2026-09-07'), '2026-09-07');
  assert.equal(isoWeekNumber('2026-01-05'), 2);
  assert.equal(isoWeekNumber('2025-12-29'), 1); // gehört schon zu KW 1/2026
  assert.equal(fmtAgo(0), 'heute');
  assert.equal(fmtAgo(30), 'vor 4 Wo.');
});
