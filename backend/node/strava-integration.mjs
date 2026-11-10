/**
 * strava-integration.mjs — Strava OAuth2 + Activity-Import für den
 * Radtouren-Tab (Touren/TourImportPanel.jsx, live-Adapter statt Datei-Upload).
 *
 * Warum ein eigenes Modul statt Stub wie garmin.js/googleFit.js: Strava hat
 * eine offene Self-Service-Developer-API (kein Partner-Approval wie Garmin),
 * deshalb lohnt sich hier ein echter Code-Pfad statt eines dauerhaften
 * "nicht konfiguriert"-Stubs (siehe adapters/live/liveAdapter.js).
 *
 * Credentials: ~/.env/strava.json { "client_id": "...", "client_secret": "..." }
 * (Setup-Anleitung: siehe docs/STRAVA_SETUP.md). Tokens (access/refresh) landen
 * NICHT dort, sondern pro Nutzer unter ~/.aos/users/<uid>/fitness/integrations/strava.json
 * — analog zum bestehenden DATA_DIR-Muster in server.mjs.
 *
 * client_secret verlässt bewusst nie den Browser — der ganze OAuth-Code-
 * Exchange läuft serverseitig hier, das Frontend sieht nur die Redirect-URLs.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CRED_PATH = path.join(os.homedir(), ".env", "strava.json");
const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// Strava-Activity-"type"/"sport_type"-Werte, die als Radtour zählen.
const RIDE_TYPES = new Set(["Ride", "GravelRide", "MountainBikeRide", "EBikeRide", "VirtualRide"]);

function tokenPathFor(dataDir) {
  return path.join(dataDir, "integrations", "strava.json");
}

export function loadStravaCredentials() {
  try {
    const raw = fs.readFileSync(CRED_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.client_id && parsed?.client_secret) return parsed;
  } catch {}
  return null;
}

function loadTokens(dataDir) {
  try {
    return JSON.parse(fs.readFileSync(tokenPathFor(dataDir), "utf-8"));
  } catch {
    return null;
  }
}

function saveTokens(dataDir, tokens) {
  const p = tokenPathFor(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tokens, null, 2));
}

export function stravaStatus(dataDir) {
  const creds = loadStravaCredentials();
  const tokens = loadTokens(dataDir);
  return {
    configured: !!creds,
    connected: !!tokens?.refresh_token,
    athlete: tokens?.athlete || null,
  };
}

export function buildAuthorizeUrl(redirectUri) {
  const creds = loadStravaCredentials();
  if (!creds) throw new Error(`Strava: keine Credentials unter ${CRED_PATH} gefunden — siehe docs/STRAVA_SETUP.md.`);
  const params = new URLSearchParams({
    client_id: creds.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens({ dataDir, code, redirectUri }) {
  const creds = loadStravaCredentials();
  if (!creds) throw new Error(`Strava: keine Credentials unter ${CRED_PATH} gefunden.`);
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Strava-Token-Exchange fehlgeschlagen: ${data?.message || res.status}`);
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at, // unix seconds
    athlete: data.athlete ? { id: data.athlete.id, firstname: data.athlete.firstname, lastname: data.athlete.lastname } : null,
  };
  saveTokens(dataDir, tokens);
  return tokens;
}

async function refreshIfNeeded(dataDir) {
  const creds = loadStravaCredentials();
  if (!creds) throw new Error(`Strava: keine Credentials unter ${CRED_PATH} gefunden.`);
  let tokens = loadTokens(dataDir);
  if (!tokens?.refresh_token) throw new Error("Strava: nicht verbunden — erst 'Verbinden' klicken.");

  const soon = Math.floor(Date.now() / 1000) + 300; // 5 Min Puffer
  if (tokens.expires_at && tokens.expires_at > soon) return tokens;

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Strava-Token-Refresh fehlgeschlagen: ${data?.message || res.status}`);
  tokens = { ...tokens, access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at };
  saveTokens(dataDir, tokens);
  return tokens;
}

export function disconnectStrava(dataDir) {
  const p = tokenPathFor(dataDir);
  try { fs.unlinkSync(p); } catch {}
}

/** Strava-Activity (Strecken-Objekt) → Radtour-Objekt im Schema von lib/tours/schema.js */
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

export async function fetchStravaTours({ dataDir, perPage = 30 }) {
  const tokens = await refreshIfNeeded(dataDir);
  const params = new URLSearchParams({ per_page: String(perPage) });
  const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Strava-API-Fehler ${res.status}: ${body.slice(0, 200)}`);
  }
  const activities = await res.json();
  return activities
    .filter((a) => RIDE_TYPES.has(a.type) || RIDE_TYPES.has(a.sport_type))
    .map(toTour);
}
