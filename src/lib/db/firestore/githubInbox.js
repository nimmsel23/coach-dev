/**
 * Read-only GitHub PR inbox for the public KB repo (nimmsel23/fitness).
 * Transition path: Firestore coachInbox remains until approve/reenrich move to PRs.
 */

const FITNESS_KB_REPO = "nimmsel23/fitness";
const PULLS_URL = `https://api.github.com/repos/${FITNESS_KB_REPO}/pulls?state=open&per_page=30`;

async function ghJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "vos-coach-inbox",
    },
  });
  if (!res.ok) throw new Error(`github_${res.status}`);
  return res.json();
}

/** Open PRs that touch inbox/** → InboxCard-compatible rows. */
export async function listGithubInboxPrs() {
  const pulls = await ghJson(PULLS_URL);
  if (!Array.isArray(pulls)) return [];

  const rows = await Promise.all(
    pulls.map(async (pr) => {
      try {
        const files = await ghJson(
          `https://api.github.com/repos/${FITNESS_KB_REPO}/pulls/${pr.number}/files?per_page=100`,
        );
        const inboxFiles = (Array.isArray(files) ? files : [])
          .map((f) => f?.filename)
          .filter((name) => typeof name === "string" && name.startsWith("inbox/"));
        if (!inboxFiles.length) return null;

        const title = pr.title || `PR #${pr.number}`;
        return {
          file_id: `pr-${pr.number}`,
          name: title,
          description: `GitHub PR #${pr.number} · ${inboxFiles.join(", ")}`,
          status: pr.draft ? "pr_draft" : "github_pr",
          cache_source: "github_pr",
          html_url: pr.html_url,
          pr_number: pr.number,
          inbox_files: inboxFiles,
          userId: pr.user?.login || null,
          received_at: pr.created_at || null,
          exercises: [
            {
              display_name: title,
              german: title,
              english: title,
              description: inboxFiles.join(", "),
              coaching_notes: [
                "Draft lebt als GitHub-PR auf nimmsel23/fitness (inbox/).",
                "Freigabe/Reject vorerst auf GitHub; CI-Enrichment: workflow Enrich Inbox.",
              ],
              tags: ["github_pr"],
            },
          ],
        };
      } catch {
        return null;
      }
    }),
  );

  return rows.filter(Boolean);
}

export function isGithubInboxItem(item) {
  return item?.cache_source === "github_pr" || String(item?.file_id || "").startsWith("pr-");
}
