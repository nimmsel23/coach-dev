import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join } from "path";

// Initialize Admin SDK
const serviceAccount = JSON.parse(readFileSync(join(process.env.HOME, ".config", "fuel-pwa", "service-account.json"), "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const OLD_UID = "default";
const NEW_UID = "AdYySTAREic85F60bSIDdA8uj3V2";

const COLLECTIONS = [
  "nutrition/logs",
  "nutrition/journal",
  "supplements/logs",
  "supplements/meta"
];

async function migrate() {
  console.log(`🚀 Starting migration: ${OLD_UID} -> ${NEW_UID}`);
  
  for (const colPath of COLLECTIONS) {
    console.log(`Processing ${colPath}...`);
    const oldCol = db.collection(colPath.split('/')[0]).doc(OLD_UID).collection(colPath.split('/')[1]);
    const newCol = db.collection(colPath.split('/')[0]).doc(NEW_UID).collection(colPath.split('/')[1]);
    
    const snapshot = await oldCol.get();
    
    for (const doc of snapshot.docs) {
      console.log(`  → Copying ${doc.id}`);
      await newCol.doc(doc.id).set(doc.data());
    }
  }
  
  console.log("✅ Migration complete.");
}

migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
