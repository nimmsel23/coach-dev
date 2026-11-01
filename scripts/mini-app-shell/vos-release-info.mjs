import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const VIEW_PATHS = ['src/views', 'src/client/views'];
const git = (root, ...args) => {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
};
// prefixes: Ordner (`src/views`) oder einzelne Dateien (`src/App.jsx`); Standard sind die View-Ordner.
const isViewPath = (path, prefixes = VIEW_PATHS) => typeof path === 'string'
  && prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
  && /\.(?:[cm]?[jt]sx?|css|scss|sass|less|vue|svelte|html|svg)$/.test(path)
  && !/(?:^|\/)(?:__tests__|__snapshots__|tests?|fixtures?|stories|docs)(?:\/|\.)|\.(?:test|spec|stories)\./i.test(path);

// Keep source selection deterministic in CI: infrastructure and code maintenance
// do not become product news just because a view file was touched too.
function releaseNotes(commits) {
  const notes = new Map();
  for (const commit of commits) {
    if (/^(?:merge\b|(?:chore|ci|build|docs|test|refactor)(?:\([^)]*\))?[!:])/i.test(commit.message)) continue;
    if (/^(?:fix|feat|perf|style)\((?:deps(?:-dev)?|ci|build|release|tooling|tests?)\)[!:]/i.test(commit.message)) continue;
    const message = commit.message.replace(/^(?:feat|fix|perf|style)(?:\([^)]*\))?!?:\s*/i, '').trim();
    if (!message) continue;
    const key = message.toLocaleLowerCase('de').replace(/[.!\s]+$/g, '');
    // Keep the newest source link for repeated fixes in a single app update.
    notes.delete(key);
    notes.set(key, { ...commit, message });
  }
  return [...notes.values()];
}
const parseLog = (output) => output.split('\n').filter(Boolean).map(line => {
  const [sha, ...subject] = line.split('\t');
  return { sha, message: subject.join('\t') };
}).filter(commit => /^[a-f0-9]{40,64}$/i.test(commit.sha) && commit.message);

function readRepository({ root, env = process.env } = {}) {
  // An uninitialized submodule directory must not inherit its parent's Git data.
  try { if (realpathSync(git(root, 'rev-parse', '--show-toplevel')) !== realpathSync(root)) return null; }
  catch { return null; }
  const id = git(root, 'rev-parse', 'HEAD');
  if (!id) return null;
  const remote = git(root, 'remote', 'get-url', 'origin');
  // Only publish a credential-free repository address, never the raw CI remote.
  let repository = '';
  try {
    const url = new URL(remote.replace(/^git@([^:]+):/, 'https://$1/').replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/'));
    if (url.protocol === 'https:' || url.protocol === 'http:')
      repository = `${url.protocol}//${url.host}${url.pathname.replace(/\.git$/, '')}`;
  } catch { /* Unrecognized remotes must not enter public artifacts. */ }
  const matchingEvent = env.GITHUB_SHA === id && repository === `https://github.com/${env.GITHUB_REPOSITORY}`;
  return { id, repository, matchingEvent };
}

function readEvent({ env, matchingEvent }) {
  if (!matchingEvent || !env.GITHUB_EVENT_PATH) return null;
  try { return JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')); }
  catch { return null; }
}

function commitsFromPush(event, prefixes = VIEW_PATHS) {
  if (!Array.isArray(event?.commits)) return [];
  return releaseNotes(event.commits
    .filter(commit => /^[a-f0-9]{40,64}$/i.test(commit?.id)
      && typeof commit.message === 'string'
      && [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])].some(path => isViewPath(path, prefixes)))
    .map(commit => ({ sha: commit.id, message: commit.message.split('\n')[0] })));
}

function commitsBetween(root, before, after, prefixes = VIEW_PATHS) {
  if (!before || !after || before === after) return [];
  try {
    execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', before, after], { stdio: 'ignore' });
  } catch { return []; }
  const records = git(root, 'log', '--no-merges', '--reverse', '--format=%x1e%H%x09%s', '--name-only', `${before}..${after}`, '--', ...prefixes);
  return releaseNotes(records.split('\x1e').flatMap(record => {
    const [subject, ...paths] = record.trim().split('\n');
    return paths.some(path => isViewPath(path, prefixes)) ? parseLog(subject) : [];
  }));
}

function rootPushCommits({ root, id, env, matchingEvent }) {
  const event = readEvent({ env, matchingEvent });
  if (Array.isArray(event?.commits)) return commitsFromPush(event);

  // Local builds show only the current commit when it changes a view. They never
  // pull unrelated historical commits into the release dialog.
  const parent = git(root, 'rev-parse', `${id}^`);
  return commitsBetween(root, parent, id);
}

function treeEntry(root, treeish, name) {
  const line = git(root, 'ls-tree', treeish, '--', name).split('\n').find(Boolean);
  const match = line?.match(/^\d+ (blob|tree|commit) ([a-f0-9]+)\t/);
  return match ? { type: match[1], sha: match[2] } : null;
}

// Resolve a path that can cross one or more submodule boundaries, for example
// fitness-app/Skills, at a particular VitalOS tree revision.
function pathRevision(root, revision, relativePath) {
  let repo = root;
  let treeish = revision;
  const parts = relativePath.split('/').filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const entry = treeEntry(repo, treeish, part);
    if (!entry) return null;
    if (entry.type === 'commit') {
      treeish = entry.sha;
      repo = resolve(repo, part);
    } else if (entry.type === 'tree') {
      treeish = entry.sha;
    } else if (index < parts.length - 1) {
      return null;
    } else {
      return entry.sha;
    }
  }
  return treeish;
}

function changedAppCommits({ root, before, after, appRoot, appPath }) {
  const previous = before ? pathRevision(root, before, appPath) : null;
  const current = pathRevision(root, after, appPath) || git(appRoot, 'rev-parse', 'HEAD');
  if (!current || previous === current) return [];
  if (!previous) {
    const parent = git(appRoot, 'rev-parse', `${current}^`);
    return commitsBetween(appRoot, parent, current);
  }
  return commitsBetween(appRoot, previous, current);
}

export function readVosReleaseInfo({ root = process.cwd(), env = process.env } = {}) {
  const repositoryInfo = readRepository({ root, env });
  if (!repositoryInfo) return null;
  const commits = rootPushCommits({ root, ...repositoryInfo, env });
  if (!commits.length) return null;
  return { id: repositoryInfo.id, repository: repositoryInfo.repository, commits };
}

// Use the checkouts actually consumed by this build, including nested apps.
// shellPaths: zusätzliche Pfade, die im Shell-Repo selbst als Produktänderung zählen (z. B. src/shell, src/App.jsx).
export function readVosShellReleaseInfo({ root = process.cwd(), apps = [], shellPaths = [], env = process.env } = {}) {
  const shell = readRepository({ root, env });
  if (!shell) return null;
  const event = readEvent({ env, matchingEvent: shell.matchingEvent });
  const after = event?.after || shell.id;
  const before = event?.before && !/^0+$/.test(event.before)
    ? event.before
    : git(root, 'rev-parse', `${after}^`);
  const shellPrefixes = [...VIEW_PATHS, ...shellPaths];
  const shellCommits = Array.isArray(event?.commits)
    ? commitsFromPush(event, shellPrefixes)
    : commitsBetween(root, before, after, shellPrefixes);
  const sections = shellCommits.length ? [{ ...shell, appName: 'VitalOS', commits: shellCommits }] : [];
  for (const app of apps) {
    const appRoot = resolve(root, app.path);
    const release = readRepository({ root: appRoot, env });
    if (!release) continue;
    const commits = changedAppCommits({ root, before, after, appRoot, appPath: app.path });
    if (commits.length) sections.push({ ...release, appName: app.name, commits });
  }
  if (!sections.length) return null;
  // One acknowledgement covers the view changes included in this shell update.
  const id = createHash('sha256').update(JSON.stringify(sections.map(section => [
    section.appName,
    section.commits.map(commit => commit.sha),
  ]))).digest('hex');
  return { id, repository: shell.repository, sections };
}
