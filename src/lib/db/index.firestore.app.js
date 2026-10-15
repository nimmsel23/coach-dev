// App-Barrel für fitness-devs EIGENEN Firebase-Build (@db-Ziel in vite.config.js).
// Erweitert den reinen index.firestore.js-Barrel nur um App-spezifische
// Stubs. Keine Imports aus Geschwister-Repos (@relax/@learn/...): der
// CI-Build (.github/workflows/deploy-coach.yml) checkt nur dieses Repo aus.
//
// Andere Repos, die index.firestore.js direkt importieren (learn-dev, oder
// via @fitness-db wie vitalos/habits-dev), sollen keine App-spezifika
// erzwungen bekommen.

export * from "./index.firestore.js";

export async function getNutritionNotesHistory(_limit) { return []; }
export async function getSupplementsHistory(_limit) { return []; }
