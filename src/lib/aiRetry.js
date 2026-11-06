/**
 * Retry-Wrapper für Vertex AI Calls im Browser.
 *
 * Firebase/Vertex-Fehler bei Netzwerkausfall oder Timeout sind transient —
 * ein Retry mit kurzem Backoff löst die meisten davon. Andere Fehler
 * (Quota, ungültiger Prompt, kaputtes JSON) sind es nicht und sollen
 * sofort durchschlagen statt die Wartezeit unnötig zu verlängern.
 */

const RETRYABLE_CODES = new Set([
  "unavailable", "deadline-exceeded", "resource-exhausted", "internal", "cancelled",
]);

function isRetryableError(err) {
  const code = String(err?.code || "").toLowerCase().split("/").pop();
  if (RETRYABLE_CODES.has(code)) return true;

  const msg = String(err?.message || err || "").toLowerCase();
  return ["network", "timeout", "failed to fetch", "deadline", "unavailable", "429", "503", "502"]
    .some((needle) => msg.includes(needle));
}

export function friendlyAiError(err) {
  if (isRetryableError(err)) {
    return new Error("Verbindung zu Gemini fehlgeschlagen (Netzwerk/Timeout). Bitte erneut versuchen.");
  }
  const msg = String(err?.message || err || "");
  if (msg.toLowerCase().includes("json")) {
    return new Error("Gemini hat eine ungültige Antwort geliefert. Bitte erneut versuchen.");
  }
  return new Error(msg || "Unbekannter Fehler bei der KI-Anfrage.");
}

/**
 * Führt fn() aus und wiederholt bei transienten Fehlern (Netzwerk/Timeout/
 * Rate-Limit) mit exponentiellem Backoff. Nicht-transiente Fehler werden
 * sofort als user-freundliche Message durchgereicht.
 */
export async function withAiRetry(fn, { retries = 2, baseDelayMs = 800 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isRetryableError(err)) {
        throw friendlyAiError(err);
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
}
