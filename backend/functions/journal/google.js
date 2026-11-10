// google.js — dauerhafte Google-Anbindung (Tasks + Calendar) für das Journal.
//
// Warum eine Function: Im Browser bekommt man von Google nur Access-Tokens (~1 h), nie einen
// Refresh-Token. Hier wird einmalig ein Autorisierungs-Code (Google Identity Services, Code-Popup)
// gegen einen Refresh-Token getauscht und in Firestore `googleTokens/{uid}` abgelegt. Dieses
// Dokument hat KEINE Rule in firestore.rules → der Browser kommt nicht heran, nur das Admin-SDK
// (diese Function). Der Browser holt per `googleAccessToken` bei Bedarf einen frischen Access-Token.
//
// Die Logik ist als Fabrik mit injizierten Abhängigkeiten gebaut (fetch, Speicher, HttpsError),
// damit tests/google-function.test.mjs sie ohne Netz und ohne Firebase prüft.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/tasks",
];

function createGoogleHandlers({ fetchImpl, store, clientId, clientSecret, HttpsError, now = Date.now }) {
  const configured = () => {
    if (!clientId || !clientSecret) throw new HttpsError("failed-precondition", "google-not-configured");
  };
  const form = (o) => new URLSearchParams(o).toString();
  const post = (url, body) =>
    fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(body) });

  return {
    /** Öffentliche Client-ID für das Code-Popup im Browser. */
    linkConfig() {
      configured();
      return { clientId };
    },

    /** Autorisierungs-Code → Refresh-Token speichern, ersten Access-Token zurückgeben. */
    async link(uid, code) {
      configured();
      if (typeof code !== "string" || !code) throw new HttpsError("invalid-argument", "google-code-missing");
      let res;
      try {
        // redirect_uri "postmessage" ist der feste Wert des GIS-Popup-Flows
        res = await post(TOKEN_URL, { code, client_id: clientId, client_secret: clientSecret, redirect_uri: "postmessage", grant_type: "authorization_code" });
      } catch {
        throw new HttpsError("unavailable", "google-unreachable");
      }
      const tok = await res.json().catch(() => ({}));
      if (!res.ok || !tok.access_token) throw new HttpsError("invalid-argument", `google-code: ${tok.error || res.status}`);
      const scope = String(tok.scope || "");
      const missing = REQUIRED_SCOPES.filter((s) => !scope.split(" ").includes(s));
      if (missing.length) throw new HttpsError("failed-precondition", "google-scope-missing");
      // Google liefert den Refresh-Token nur bei der ersten Einwilligung; sonst den vorhandenen behalten
      const prev = await store.get(uid);
      const refreshToken = tok.refresh_token || prev?.refreshToken;
      if (!refreshToken) throw new HttpsError("failed-precondition", "google-no-refresh-token");
      await store.set(uid, { refreshToken, scope, updatedAt: now() });
      return { accessToken: tok.access_token, expiresAt: now() + Number(tok.expires_in || 3600) * 1000 };
    },

    /** Frischer Access-Token aus dem gespeicherten Refresh-Token. */
    async accessToken(uid) {
      configured();
      const doc = await store.get(uid);
      if (!doc?.refreshToken) throw new HttpsError("failed-precondition", "google-not-linked");
      let res;
      try {
        res = await post(TOKEN_URL, { refresh_token: doc.refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" });
      } catch {
        throw new HttpsError("unavailable", "google-unreachable");
      }
      const tok = await res.json().catch(() => ({}));
      if (!res.ok) {
        // widerrufen / abgelaufen (z. B. Zustimmungsbildschirm im Status „Testing“: 7 Tage) → neu verbinden
        if (tok.error === "invalid_grant") {
          await store.delete(uid);
          throw new HttpsError("failed-precondition", "google-not-linked");
        }
        throw new HttpsError("unavailable", "google-unreachable");
      }
      return { accessToken: tok.access_token, expiresAt: now() + Number(tok.expires_in || 3600) * 1000 };
    },

    /** Bei Google widerrufen (best effort) und das Dokument löschen. */
    async unlink(uid) {
      const doc = await store.get(uid);
      if (doc?.refreshToken) {
        try { await post(REVOKE_URL, { token: doc.refreshToken }); } catch { /* offline: Dokument trotzdem löschen */ }
      }
      await store.delete(uid);
      return { ok: true };
    },
  };
}

// Older clients omit expected_uid. Updated clients bind token operations to the
// account that initiated them, even if Firebase authentication changes in flight.
function assertExpectedGoogleUid(uid, data, HttpsError) {
  if (Object.hasOwn(data || {}, "expected_uid") && (typeof data.expected_uid !== "string" || data.expected_uid !== uid)) {
    throw new HttpsError("permission-denied", "google-account-changed");
  }
}

module.exports = { createGoogleHandlers, REQUIRED_SCOPES, assertExpectedGoogleUid };
