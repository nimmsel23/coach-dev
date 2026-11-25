import assert from 'node:assert/strict';
import test from 'node:test';
import { githubIssueToInbox, listGithubInboxIssues, mergeWithGithub } from './githubInbox.js';

const issue = {
  number: 14, title: 'Übung prüfen: Weiter Untergriff-Klimmzug',
  html_url: 'https://github.com/nimmsel23/fitness/issues/14',
  user: { login: 'github-actions[bot]' },
  body: `<!-- inbox-file:inbox/inbox_wide_grip_chin_up.yml -->
## Weiter Untergriff-Klimmzug
*Wide Grip Chin-Up* · Kategorie **pull** · Equipment: pull-up bar, body only · Status: \`draft\`
### Muskeln
- **Primär:** 201_latissimus_dorsi
- **Sekundär:** 402_biceps_brachii
- **Stabilisatoren:** —
### Quellen
- **wger:** bewusst getrennt
- **yuhonas:** —
### Coaching-Notizen
- Schultern aktiv stabilisieren.
- Kontrolliert ablassen.
### Fehlerbilder
- **Schwungholen:** Bewegung kontrollieren.
---
**Befehle** (als Kommentar):
- \`/approve\` — freigeben
`,
};

test('issue summary supplies exercise content without inventing a client or leaking bot instructions', () => {
  const item = githubIssueToInbox(issue);
  const data = item.exercises[0];
  assert.equal(item.userId, null);
  assert.equal(data.description, 'Schultern aktiv stabilisieren.');
  assert.deepEqual(data.coaching_notes, ['Schultern aktiv stabilisieren.', 'Kontrolliert ablassen.']);
  assert.deepEqual(data.primary_muscles, ['201_latissimus_dorsi']);
  assert.deepEqual(data.equipment, ['pull-up bar', 'body only']);
  assert.equal(data.category, 'pull');
  assert.equal(data.english, 'Wide Grip Chin-Up');
  assert.deepEqual(data.external_ids, {});
  assert.deepEqual(data.common_errors, ['Schwungholen: Bewegung kontrollieren.']);
  assert.equal(JSON.stringify(data).includes('/approve'), false);
  assert.equal(JSON.stringify(data).includes('inbox/'), false);
  assert.equal(item.inbox_file_stem, 'inbox_wide_grip_chin_up');
});

test('only explicit linked source IDs become source references', () => {
  const body = issue.body.replace('bewusst getrennt', '[1465](https://wger.de/en/exercise/1465/view/)').replace('**yuhonas:** —', '**yuhonas:** [Chin_Up](https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Chin_Up.json)');
  assert.deepEqual(githubIssueToInbox({ ...issue, body }).exercises[0].external_ids, { wger: ['1465'], yuhonas: ['Chin_Up'] });
});

test('missing issue sections stay empty and do not fabricate a description', () => {
  const item = githubIssueToInbox({ ...issue, body: null });
  assert.equal(item.exercises[0].description, '');
  assert.deepEqual(item.exercises[0].coaching_notes, []);
});

test('listing excludes pull requests and still deduplicates laptop drafts', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => [issue, { ...issue, number: 15, pull_request: {} }] }));
  const rows = await listGithubInboxIssues();
  assert.equal(rows.length, 1);
  assert.equal(mergeWithGithub(rows, [{ file_id: 'inbox_wide_grip_chin_up' }]).length, 1);
});
