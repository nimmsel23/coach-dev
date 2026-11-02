import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getMessaging, isSupported as isMessagingSupported } from "firebase/messaging";
import * as firebaseAI from "firebase/ai";
import { getFunctions, httpsCallable } from "firebase/functions";
import { config } from "../firebase.config.js";

const alreadyInit = getApps().length > 0;
const app = alreadyInit ? getApp() : initializeApp(config);

let vertexAIInstance = undefined;

// Browser-seitigen Vertex-AI-Zugang NICHT auf Modulebene initialisieren:
// wenn getAI() im Hosting-Browser wirft, crasht die ganze App noch vor dem
// ersten Render. Deshalb lazy + fehlertolerant; echte Enrichment-Calls können
// dann gezielt mit "nicht verfügbar" scheitern statt einen Whitescreen zu
// verursachen.
export function getVertexAI() {
  if (vertexAIInstance !== undefined) return vertexAIInstance;
  try {
    // @firebase/ai >= 3 benennt VertexAIBackend in AgentPlatformBackend um.
    // Location explizit setzen: der neue Default ist "global", der alte war us-central1.
    // Namespace-Import: die Vitalos-Shell dedupliziert firebase auf eine Root-Kopie
    // (11.x, dort heißt die Klasse noch VertexAIBackend) — ein Named Import von
    // AgentPlatformBackend würde dort mit SyntaxError die ganze App lahmlegen.
    const Backend = firebaseAI.AgentPlatformBackend ?? firebaseAI.VertexAIBackend;
    vertexAIInstance = firebaseAI.getAI(app, { backend: new Backend("us-central1") });
  } catch (error) {
    console.warn("[firebase] Vertex AI init failed", error);
    vertexAIInstance = null;
  }
  return vertexAIInstance;
}

export const db = alreadyInit
  ? getFirestore(app)
  : initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      // Ohne dieses Flag wirft setDoc() bei jedem undefined-Feldwert (z.B. eine
      // Übung ohne aufgelöste catalog-id) — Auto-Save fängt das im silent-Modus
      // ab und zeigt keinen Fehler, wodurch ganze Session-Saves lautlos verpuffen.
      ignoreUndefinedProperties: true,
    });

// Region muss mit functions/strava.js (REGION-Konstante) übereinstimmen —
// sonst 404, weil httpsCallable() sonst auf der Default-Region sucht.
export const functionsInstance = getFunctions(app, "europe-west1");
export { httpsCallable };

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

export const googleProvider = new GoogleAuthProvider();

let messagingPromise = null;

export async function getMessagingIfSupported() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  if (!("serviceWorker" in navigator) || typeof Notification === "undefined") return null;

  if (!messagingPromise) {
    messagingPromise = isMessagingSupported()
      .then((supported) => (supported ? getMessaging(app) : null))
      .catch(() => null);
  }

  return messagingPromise;
}
