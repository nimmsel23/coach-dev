/**
 * functions/strava.js — Strava-OAuth-Logik für die Firebase-Prod-PWA
 * (fitness-aos.web.app). Serverseitiges Gegenstück zu strava-integration.mjs
 * (dev/server.mjs) — gleiche Idee (client_secret verlässt nie den Browser),
 * andere Laufzeit: hier Cloud Functions statt Node-Prozess, Tokens landen in
 * Firestore statt in einer lokalen JSON-Datei (Cloud Functions sind
 * zustandslos, kein lokales Dateisystem, das Deploys überlebt).
 *
 * Credentials NICHT im Repo — via `firebase functions:config:set
 * strava.client_id="..." strava.client_secret="..."` gesetzt (siehe
 * docs/STRAVA_SETUP.md, Abschnitt "Prod/Firebase").
 */
const functions = require("firebase-functions");

const REGION = "europe-west1";
const PROJECT_ID = "fitness-aos";
const REDIRECT_URI = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/stravaCallback`;
const APP_URL = "https://fitness-aos.web.app";
const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const RIDE_TYPES = new Set(["Ride", "GravelRide", "MountainBikeRide", "EBikeRide", "VirtualRide"]);
const STATE_TTL_MS = 10 * 60 * 1000; // 10 Min, ausreichend für den OAuth-Roundtrip

function getCredentials() {
  const cfg = functions.config().strava || {};
  if (!cfg.client_id || !cfg.client_secret) return null;
  return { clientId: cfg.client_id, clientSecret: cfg.client_secret };
}

function tokenDoc(db, uid) {
  return db.collection("fitness").doc(uid).collection("integrations").doc("strava");
}
function stateDoc(db, uid) {
  return db.collection("fitness").doc(uid).collection("integrations").doc("stravaPendingState");
}

async function status(db, uid) {
  const creds = getCredentials();
  const snap = await tokenDoc(db, uid).get();
  const data = snap.exists ? snap.data() : null;
  return {
    configured: !!creds,
    connected: !!data?.refresh_token,
    athlete: data?.athlete || null,
  };
}

/** Erzeugt die Strava-Authorize-URL + hinterlegt einen kurzlebigen State-Token zur uid-Verifikation im Callback. */
async function buildAuthorizeUrl(db, uid) {
  const creds = getCredentials();
  if (!creds) throw new functions.https.HttpsError("failed-precondition", "Strava: keine Credentials konfiguriert (functions:config:set strava.client_id/client_secret).");

  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await stateDoc(db, uid).set({ token, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
    state: `${uid}.${token}`,
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

/** Verifiziert den State-Parameter aus dem Callback-Redirect und liefert die zugehörige uid. */
async function verifyState(db, state) {
  const [uid, token] = String(state || "").split(".");
  if (!uid || !token) throw new Error("Strava: ungültiger state-Parameter.");
  const snap = await stateDoc(db, uid).get();
  const data = snap.exists ? snap.data() : null;
  if (!data || data.token !== token) throw new Error("Strava: state-Token stimmt nicht überein (evtl. abgelaufen).");
  if (Date.now() - data.createdAt > STATE_TTL_MS) throw new Error("Strava: state-Token abgelaufen — bitte erneut verbinden.");
  await stateDoc(db, uid).delete();
  return uid;
}

async function exchangeCodeForTokens(db, { code, state }) {
  const creds = getCredentials();
  if (!creds) throw new Error("Strava: keine Credentials konfiguriert.");
  const uid = await verifyState(db, state);

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Strava-Token-Exchange fehlgeschlagen: ${data?.message || res.status}`);

  await tokenDoc(db, uid).set({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: data.athlete ? { id: data.athlete.id, firstname: data.athlete.firstname, lastname: data.athlete.lastname } : null,
  });
  return uid;
}

async function refreshIfNeeded(db, uid) {
  const creds = getCredentials();
  if (!creds) throw new functions.https.HttpsError("failed-precondition", "Strava: keine Credentials konfiguriert.");
  const ref = tokenDoc(db, uid);
  const snap = await ref.get();
  let tokens = snap.exists ? snap.data() : null;
  if (!tokens?.refresh_token) throw new functions.https.HttpsError("failed-precondition", "Strava: nicht verbunden — erst 'Verbinden' klicken.");

  const soon = Math.floor(Date.now() / 1000) + 300;
  if (tokens.expires_at && tokens.expires_at > soon) return tokens;

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new functions.https.HttpsError("internal", `Strava-Token-Refresh fehlgeschlagen: ${data?.message || res.status}`);
  tokens = { ...tokens, access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at };
  await ref.set(tokens);
  return tokens;
}

function toTour(activity) {
  const distanceKm = activity.distance != null ? Math.round((activity.distance / 1000) * 100) / 100 : null;
  const durationMin = activity.moving_time != null ? Math.round(activity.moving_time / 60) : null;
  const avgSpeedKmh = activity.average_speed != null ? Math.round(activity.average_speed * 3.6 * 10) / 10 : null;
  const maxSpeedKmh = activity.max_speed != null ? Math.round(activity.max_speed * 3.6 * 10) / 10 : null;
  return {
    date: String(activity.start_date_local || activity.start_date || "").slice(0, 10),
    distanceKm,
    durationMin,
    avgSpeedKmh,
    maxSpeedKmh,
    elevationGainM: activity.total_elevation_gain != null ? Math.round(activity.total_elevation_gain) : null,
    notes: activity.name || "",
    source: "strava",
    _stravaId: activity.id,
  };
}

async function fetchActivities(db, uid, { perPage = 30 } = {}) {
  const tokens = await refreshIfNeeded(db, uid);
  const params = new URLSearchParams({ per_page: String(perPage) });
  const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new functions.https.HttpsError("internal", `Strava-API-Fehler ${res.status}: ${body.slice(0, 200)}`);
  }
  const activities = await res.json();
  return activities.filter((a) => RIDE_TYPES.has(a.type) || RIDE_TYPES.has(a.sport_type)).map(toTour);
}

async function disconnect(db, uid) {
  await tokenDoc(db, uid).delete();
}

module.exports = {
  REGION,
  APP_URL,
  status,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchActivities,
  disconnect,
};
