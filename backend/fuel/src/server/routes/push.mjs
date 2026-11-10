import webpush from "web-push";
import {
  buildDailyPromptPayload,
  getSubscriptionsPath,
  loadPushSettings,
  loadSubscriptions,
  normalizePushSettings,
  savePushSettings,
  saveSubscriptions,
} from "../lib/push-config.mjs";
import { snoozeItems } from "../services/push-snooze.mjs";
import { todayISO } from "../../shared/utils/validation.mjs";

// Konfiguration der VAPID Keys
// Für Produktion sollten diese aus Umgebungsvariablen kommen (.env)
// public: BOafCxLae9KCsYm5j6NJv0csS_Qmvtef8XWszQBootQiX6Cpvkih3fL3P71dXP_2T05CMSXO3bwGxLNZN_SbF_w
// private: zD3-SRxK2iGrs8XVEavlgkgQn9X9XtrXVef7ams3VXI

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BOafCxLae9KCsYm5j6NJv0csS_Qmvtef8XWszQBootQiX6Cpvkih3fL3P71dXP_2T05CMSXO3bwGxLNZN_SbF_w";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "zD3-SRxK2iGrs8XVEavlgkgQn9X9XtrXVef7ams3VXI";
webpush.setVapidDetails(
  "mailto:example@yourdomain.org",
  PUBLIC_KEY,
  PRIVATE_KEY
);

export default async function pushRoute(fastify, options) {
  // Liefert den Public Key ans Frontend
  fastify.get("/push/vapidPublicKey", async (req, reply) => {
    return { publicKey: PUBLIC_KEY };
  });

  // Nimmt ein neues Abonnement vom Frontend entgegen
  fastify.post("/push/subscribe", async (req, reply) => {
    const subscription = req.body;
    const subPath = getSubscriptionsPath(req.paths.dataDir);
    
    let subscriptions = loadSubscriptions(subPath);
    
    // Prüfen, ob schon vorhanden (einfacher check via endpoint)
    const exists = subscriptions.find(sub => sub.endpoint === subscription.endpoint);
    if (!exists) {
      subscriptions.push(subscription);
      saveSubscriptions(subPath, subscriptions);
      fastify.log.info("New push subscription added");
    }

    reply.status(201).send({ ok: true });
  });

  fastify.get("/push/settings", async (req) => {
    return loadPushSettings(req.paths.dataDir);
  });

  fastify.post("/push/settings", async (req, reply) => {
    const normalized = normalizePushSettings(req.body || {});
    savePushSettings(req.paths.dataDir, normalized);
    fastify.log.info({
      topic: "push-settings",
      uid: req.uid || null,
      dataDir: req.paths.dataDir,
      dailyPrompts: normalized.daily_prompts,
      supplements: normalized.supplements,
    }, "Saved push settings");
    reply.send({ ok: true, settings: normalized });
  });

  // "Später"-Button auf Supplement-Notifications: haelt den Reminder fuer
  // 30min zurueck statt ihn sofort wieder zu senden (push-scheduler prueft
  // isSnoozed() bei jedem Tick).
  fastify.post("/push/snooze", async (req, reply) => {
    const { item_ids, date } = req.body || {};
    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return reply.status(400).send({ ok: false, error: "item_ids required" });
    }
    const dateStr = typeof date === "string" && date ? date : todayISO();
    const until = snoozeItems(req.paths.dataDir, dateStr, item_ids);
    reply.send({ ok: true, until });
  });

  fastify.post("/push/test", async (req, reply) => {
    const { prompt_id = "fuel_quick_log" } = req.body || {};
    const payload = buildDailyPromptPayload(prompt_id);
    if (!payload) {
      return reply.status(400).send({ ok: false, error: `Unknown prompt_id: ${prompt_id}` });
    }

    const subscriptions = loadSubscriptions(getSubscriptionsPath(req.paths.dataDir));
    if (subscriptions.length === 0) {
      return reply.status(400).send({ ok: false, error: "No local push subscriptions found" });
    }

    const results = [];
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
        results.push({ endpoint: sub.endpoint, ok: true });
      } catch (error) {
        results.push({ endpoint: sub.endpoint, ok: false, statusCode: error?.statusCode || null });
      }
    }

    fastify.log.info({
      topic: "push-test",
      promptId: prompt_id,
      uid: req.uid || null,
      subscriptions: subscriptions.length,
    }, "Sent local test notification");
    reply.send({ ok: true, prompt_id, subscriptions: subscriptions.length, results });
  });
}
