/**
 * Übungs-Inbox auf GitHub (nimmsel23/fitness) — Cloud-SOT der Inbox.
 * Jeder Draft `inbox/*.yml` hat ein offenes Issue mit Label `inbox`; Befehle
 * (/approve, /reenrich, /unlink …) laufen als Issue-Kommentar über den
 * Inbox-Bot (siehe INBOX.md im KB-Repo). Die App liest nur und verlinkt.
 */

const FITNESS_KB_REPO = "nimmsel23/fitness";
const ISSUES_URL = `https://api.github.com/repos/${FITNESS_KB_REPO}/issues?labels=inbox&state=open&per_page=100`;
const MARKER = /inbox-file:(\S+?) -->/;

async function ghJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`github_${res.status}`);
  return res.json();
}

function plain(value = '') {
  return value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').trim();
}

/** Read the published issue summary; never substitute workflow instructions for exercise content. */
export function githubIssueToInbox(issue) {
  const body = String(issue.body || '').replace(/\r\n/g, '\n');
  const file = body.match(MARKER)?.[1] || null;
  const name = String(issue.title || '').replace(/^Übung prüfen:\s*/i, '') || 'Unbenannte Übungsanfrage';
  const sections = body.split(/^###\s+/m).slice(1);
  const section = (title) => sections.find(value => value.split('\n')[0].trim() === title)?.split('\n').slice(1).join('\n').split(/^---/m)[0] || '';
  const bullets = (title) => section(title).split('\n').filter(line => /^-\s/.test(line)).map(line => plain(line.replace(/^-\s+/, '')));
  const field = (title, label) => section(title).match(new RegExp(`^- \\*\\*${label}:\\*\\*\\s*(.*)$`, 'm'))?.[1] || '';
  const list = (value) => plain(value).split(',').map(item => item.trim()).filter(item => item && item !== '—');
  const notes = bullets('Coaching-Notizen');
  const refs = {};
  for (const source of ['wger', 'yuhonas']) {
    const value = field('Quellen', source);
    const id = value.match(/\[([^\]]+)\]\(https:\/\//)?.[1];
    if (id) refs[source] = [id];
  }
  const data = {
    display_name: name,
    german: name,
    english: body.match(/^\*([^*\n]+)\*\s*·/m)?.[1] || '',
    category: plain(body.match(/Kategorie \*\*([^*]+)\*\*/)?.[1] || ''),
    equipment: list(body.match(/Equipment:\s*(.*?)\s*·/)?.[1] || ''),
    description: notes[0] || '',
    coaching_notes: notes,
    common_errors: bullets('Fehlerbilder'),
    primary_muscles: list(field('Muskeln', 'Primär')),
    secondary_muscles: list(field('Muskeln', 'Sekundär')),
    stabilizers: list(field('Muskeln', 'Stabilisatoren')),
    external_ids: refs,
    tags: ['github_issue'],
  };
  return {
    file_id: `gh-${issue.number}`,
    inbox_file_stem: file ? file.split('/').pop().replace(/\.ya?ml$/, '') : null,
    name,
    status: 'github_issue',
    cache_source: 'github_issue',
    html_url: issue.html_url,
    issue_number: issue.number,
    inbox_files: file ? [file] : [],
    // Issue creators include automation accounts; they are not client identities.
    userId: null,
    received_at: issue.created_at || null,
    exercises: [data],
  };
}

/** Offene Inbox-Issues → InboxCard-kompatible Zeilen. */
export async function listGithubInboxIssues() {
  const issues = await ghJson(ISSUES_URL);
  return Array.isArray(issues) ? issues.filter(issue => !issue.pull_request).map(githubIssueToInbox) : [];
}

export function isGithubInboxItem(item) {
  return String(item?.cache_source || "").startsWith("github") || /^(gh|pr)-/.test(String(item?.file_id || ""));
}

/** GitHub-Einträge zuerst; Laptop-/Firestore-Kopien desselben Drafts ausblenden. */
export function mergeWithGithub(githubItems, otherItems) {
  const covered = new Set(githubItems.flatMap((g) => [g.file_id, g.inbox_file_stem].filter(Boolean)));
  return [...githubItems, ...otherItems.filter((item) => !covered.has(item.file_id))];
}
