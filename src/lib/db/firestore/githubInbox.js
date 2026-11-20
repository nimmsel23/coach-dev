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

/** Offene Inbox-Issues → InboxCard-kompatible Zeilen. */
export async function listGithubInboxIssues() {
  const issues = await ghJson(ISSUES_URL);
  if (!Array.isArray(issues)) return [];
  return issues
    .filter((issue) => !issue.pull_request)
    .map((issue) => {
      const file = issue.body?.match(MARKER)?.[1] || null;
      const name = String(issue.title || "").replace(/^Übung prüfen:\s*/i, "") || `Issue #${issue.number}`;
      return {
        file_id: `gh-${issue.number}`,
        inbox_file_stem: file ? file.split("/").pop().replace(/\.ya?ml$/, "") : null,
        name,
        description: `GitHub-Issue #${issue.number}${file ? ` · ${file}` : ""}`,
        status: "github_issue",
        cache_source: "github_issue",
        html_url: issue.html_url,
        issue_number: issue.number,
        inbox_files: file ? [file] : [],
        userId: issue.user?.login || null,
        received_at: issue.created_at || null,
        exercises: [
          {
            display_name: name,
            german: name,
            description: file || "",
            coaching_notes: [
              "Draft lebt auf GitHub (nimmsel23/fitness) — Prüfen und Befehle im Issue.",
              "/approve · /reenrich <Feedback> · /unlink wger|yuhonas · /name <Name> · /reject",
            ],
            tags: ["github_issue"],
          },
        ],
      };
    });
}

export function isGithubInboxItem(item) {
  return String(item?.cache_source || "").startsWith("github") || /^(gh|pr)-/.test(String(item?.file_id || ""));
}

/** GitHub-Einträge zuerst; Laptop-/Firestore-Kopien desselben Drafts ausblenden. */
export function mergeWithGithub(githubItems, otherItems) {
  const covered = new Set(githubItems.flatMap((g) => [g.file_id, g.inbox_file_stem].filter(Boolean)));
  return [...githubItems, ...otherItems.filter((item) => !covered.has(item.file_id))];
}
