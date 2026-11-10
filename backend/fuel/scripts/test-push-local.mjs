import admin from 'firebase-admin';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Pfad zum Service Account Key (prüft zuerst lokalen Key, sonst ~/.env/firebase-fitness.json)
const LOCAL_KEY = './serviceAccountKey.json';
const ENV_KEY = join(homedir(), '.env', 'firebase-fitness.json');

const SERVICE_ACCOUNT_PATH = existsSync(LOCAL_KEY) ? LOCAL_KEY : (existsSync(ENV_KEY) ? ENV_KEY : LOCAL_KEY);

try {
  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log(`✅ Firebase Admin SDK erfolgreich initialisiert (Key: ${SERVICE_ACCOUNT_PATH}).`);

  async function sendTestPush(targetToken) {
    if (!targetToken) {
      console.error('❌ Bitte gib einen FCM Token an!');
      console.log('Usage: node scripts/test-push-local.mjs "DEIN_FCM_TOKEN"');
      process.exit(1);
    }

    const message = {
      token: targetToken,
      notification: {
        title: 'Fuel Dev (Push Test)',
        body: 'Test-Push-Benachrichtigung für Fuel & Ernährung!',
      },
      data: {
        tab: 'fuel'
      },
      android: {
        priority: 'high',
        notification: {
          color: '#7e57c2',
        }
      }
    };

    try {
      const response = await admin.messaging().send(message);
      console.log('🚀 Push-Benachrichtigung erfolgreich gesendet! FCM ID:', response);
    } catch (error) {
      console.error('❌ Fehler beim Senden der Push-Nachricht:', error);
    }
  }

  const tokenFromArgs = process.argv[2];
  sendTestPush(tokenFromArgs);

} catch (e) {
  console.error(`❌ Konnte ${SERVICE_ACCOUNT_PATH} nicht finden oder lesen:`, e.message);
}
