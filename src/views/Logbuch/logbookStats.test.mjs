// node --test src/views/Logbuch/logbookStats.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLogbook, sessionToDigest, muscleWeekly, weekWindow, weeklyIntensity, mondayOf, isoWeekNumber, fmtTop, fmtAgo,
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

test('Digest: buildLogbook liefert aus Digests dasselbe wie aus vollen Sessions', () => {
  const full = [
    { date: '2026-09-01', block: 'Push', saved_at: 'x', notes: 'lang', exercises: [
      { exercise_id: 'bench', name: 'Bankdrücken', primaryMuscles: ['chest'], instructions: 'viel Text', setsArray: [
        { reps: '10', weight: '40', setType: 'warmup' }, { reps: '5', weight: '80', setType: 'normal', note: 'n' },
      ] },
      { id: 'dips', name: 'Dips', sets: '3', reps: '12', weight: '' },
      { name: 'Leer' },
    ] },
    { date: '2026-09-08', block: 'Pull', activity: { type: 'cardio', duration: 20 }, sessionGate: { startedAt: 'a', endedAt: 'b', gps: { lat: 1 } },
      exercises: [{ exercise_id: 'bench', name: 'Bankdrücken', setsArray: [{ reps: '5', weight: '90' }] }] },
    { date: '2026-09-08', exercises: [{ exercise_id: 'bench', name: 'Bankdrücken', setsArray: [{ reps: '3', weight: '95' }] }] },
    { date: '2026-09-10', block: 'Rest', exercises: [] },
  ];
  const digests = full.map((s) => sessionToDigest(s));
  const strip = (book) => JSON.parse(JSON.stringify(book, (k, v) => (k === 'exercises' && Array.isArray(v) && v[0] && 'setsArray' in v[0] ? undefined : v)));
  const a = buildLogbook(full, '2026-09-20');
  const b = buildLogbook(digests, '2026-09-20');
  assert.deepEqual(strip(b.kpis), strip(a.kpis));
  assert.deepEqual(b.records.map((r) => [r.key, r.date, r.score]), a.records.map((r) => [r.key, r.date, r.score]));
  assert.deepEqual(b.exercises.map((e) => [e.key, e.count, e.mode, e.peak?.score, e.last.date, e.status]),
                   a.exercises.map((e) => [e.key, e.count, e.mode, e.peak?.score, e.last.date, e.status]));
  assert.deepEqual(b.dayRows.map((d) => [d.date, d.hasWorkout, d.exerciseCount, d.volume, d.records]),
                   a.dayRows.map((d) => [d.date, d.hasWorkout, d.exerciseCount, d.volume, d.records]));
  // schlank: keine Warm-ups, keine Freitexte
  assert.equal(digests[0].exercises[0].setsArray.length, 1);
  assert.equal(digests[0].notes, undefined);
  assert.equal(digests[1].sessionGate.gps, undefined);
});

test('Digest trägt Dauer, Trainingsart, Finisher-Addons und Gate-Zeiten (Protokoll/Touren)', () => {
  const d = sessionToDigest({
    date: '2026-09-02', duration: 55, trainingsart: 'Hypertrophie', effort: 8, notes: 'x',
    activityAddons: [{ type: 'cycling', distanceKm: '30' }],
    sessionGate: { startedAt: 'a', endedAt: 'b', gps: { lat: 1 } }, exercises: [],
  });
  assert.equal(d.duration, 55);
  assert.equal(d.trainingsart, 'Hypertrophie');
  assert.equal(d.effort, 8);
  assert.equal(d.activityAddons[0].type, 'cycling');
  assert.deepEqual(d.sessionGate, { startedAt: 'a', endedAt: 'b' });
  assert.equal(d.notes, undefined);
});

test('Muskel-Volumen: Arbeitssätze je Muskel und Woche, Warm-ups zählen nicht', () => {
  const book = buildLogbook([
    bench('2026-09-08', [{ reps: '10', weight: '40', setType: 'warmup' }, { reps: '5', weight: '80' }, { reps: '5', weight: '80' }], { primaryMuscles: ['Brust'] }),
    bench('2026-09-15', [{ reps: '5', weight: '82' }], { primaryMuscles: ['Brust'] }),
  ], '2026-09-17');
  const rows = muscleWeekly(book.exercises, weekWindow('2026-09-17', 4));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].muscle, 'Brust');
  assert.deepEqual(rows[0].cells.map((c) => c.sets), [0, 0, 2, 1]);
  assert.equal(rows[0].total, 3);
  assert.equal(rows[0].last4, 3);
});
