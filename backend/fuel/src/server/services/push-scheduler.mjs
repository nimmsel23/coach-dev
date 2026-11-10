import fs from "fs";
import path from "path";
import webpush from "web-push";
import { format } from "date-fns";
import {
  buildDailyPromptPayload,
  buildSupplementPayload,
  getSubscriptionsPath,
  loadPushSettings,
} from "../lib/push-config.mjs";
import { isSnoozed } from "./push-snooze.mjs";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BOafCxLae9KCsYm5j6NJv0csS_Qmvtef8XWszQBootQiX6Cpvkih3fL3P71dXP_2T05CMSXO3bwGxLNZN_SbF_w";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "zD3-SRxK2iGrs8XVEavlgkgQn9X9XtrXVef7ams3VXI";

webpush.setVapidDetails(
  "mailto:example@yourdomain.org",
  PUBLIC_KEY,
  PRIVATE_KEY
);

// Einfache Due-Check Logik (ähnlich Frontend)
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function isDueToday(item, dateString) {
  if (!item.schedule) return false;
  if (item.schedule.type === "daily") return true;
  
  const dateObj = new Date(dateString);
  if (item.schedule.type === "weekly") {
    const dayName = WEEKDAYS[dateObj.getDay()];
    return item.schedule.days?.includes(dayName);
  }
  
  if (item.schedule.type === "cyclical") {
    if (!item.schedule.start_date || !item.schedule.interval_days) return false;
    const start = new Date(item.schedule.start_date);
    const diffTime = Math.abs(dateObj - start);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays % item.schedule.interval_days === 0;
  }
  return false;
}

export function startPushScheduler(baseDataDir, catalogsDir) {
  setInterval(async () => {
    const now = new Date();
    const settings = loadPushSettings(baseDataDir);
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const supplementSlot = settings.supplements.enabled
      ? Object.entries(settings.supplements.times).find(([, value]) => value === currentTime)?.[0] || null
      : null;
    const dueDailyPrompts = Object.entries(settings.daily_prompts || {})
      .filter(([, value]) => value?.enabled && value?.time === currentTime)
      .map(([promptId]) => promptId);

    if (supplementSlot) {
      console.log(`[PushScheduler] Running supplement check for ${supplementSlot}...`);
      await checkAndSendSupplementReminders(supplementSlot, baseDataDir, catalogsDir);
    }
    if (settings.supplements.enabled) {
      // Pro-Supplement-Reminder mit eigener Uhrzeit (unabhängig von den 4 Slots)
      await checkAndSendPerSupplementReminders(currentTime, baseDataDir, catalogsDir);
    }
    if (dueDailyPrompts.length > 0) {
      console.log(`[PushScheduler] Running daily prompts: ${dueDailyPrompts.join(", ")}`);
      await sendDailyPrompts(dueDailyPrompts, baseDataDir);
    }
  }, 60000); // alle 60 Sekunden prüfen
}

async function checkAndSendSupplementReminders(timeOfDay, baseDataDir, catalogsDir) {
  try {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const catalogPath = path.join(catalogsDir, "supplements", "catalog.json");
    const logsPath = path.join(baseDataDir, "supplements", "logs", `${todayStr}.json`);
    const subsPath = getSubscriptionsPath(baseDataDir);

    if (!fs.existsSync(catalogPath)) {
      console.log(`[PushScheduler] Skipping ${timeOfDay}: no supplements catalog at ${catalogPath}`);
      return;
    }
    if (!fs.existsSync(subsPath)) {
      console.log(`[PushScheduler] Skipping ${timeOfDay}: no push subscriptions at ${subsPath}`);
      return;
    }

    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8")).items || [];
    const subscriptions = JSON.parse(fs.readFileSync(subsPath, "utf-8")) || [];
    if (subscriptions.length === 0) {
      console.log(`[PushScheduler] Skipping ${timeOfDay}: push subscriptions list is empty`);
      return;
    }

    let intakes = [];
    if (fs.existsSync(logsPath)) {
      intakes = JSON.parse(fs.readFileSync(logsPath, "utf-8")).intakes || [];
    }

    // Fällige Supplements für diese Tageszeit finden, die noch nicht geloggt wurden
    const dueItems = catalog.filter(item => {
      // Pro-Supplement-Reminder übersteuert den Slot: enabled:false = ganz raus,
      // eigene time gesetzt = wird separat von checkAndSendPerSupplementReminders
      // verschickt (kein Doppel-Ping).
      if (item.reminder && item.reminder.enabled === false) return false;
      if (item.reminder?.enabled && item.reminder.time) return false;
      const isDue = isDueToday(item, todayStr) && item.default_time_of_day === timeOfDay;
      if (!isDue) return false;
      const isLogged = intakes.some(intake => intake.supplement_id === item.id);
      if (isLogged) return false;
      return !isSnoozed(baseDataDir, todayStr, item.id);
    });

    if (dueItems.length > 0) {
      const names = dueItems.map(i => i.name).join(", ");
      const payload = JSON.stringify(buildSupplementPayload({ timeOfDay, names, dueItems, date: todayStr }));

      console.log(`[PushScheduler] Sending reminders for: ${names}`);

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(sub, payload);
        } catch (err) {
          console.error("[PushScheduler] Send failed (maybe unsubscribed):", err.statusCode);
        }
      }
      console.log(
        `[PushScheduler] Reminder dispatch finished for ${timeOfDay} (${subscriptions.length} subscriptions)`
      );
    } else {
      console.log(`[PushScheduler] All good. No missing supplements for ${timeOfDay}.`);
    }
  } catch (error) {
    console.error("[PushScheduler] Error checking reminders:", error);
  }
}

async function checkAndSendPerSupplementReminders(currentTime, baseDataDir, catalogsDir) {
  try {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const catalogPath = path.join(catalogsDir, "supplements", "catalog.json");
    const logsPath = path.join(baseDataDir, "supplements", "logs", `${todayStr}.json`);
    const subsPath = getSubscriptionsPath(baseDataDir);

    if (!fs.existsSync(catalogPath) || !fs.existsSync(subsPath)) return;

    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8")).items || [];
    const subscriptions = JSON.parse(fs.readFileSync(subsPath, "utf-8")) || [];
    if (subscriptions.length === 0) return;

    let intakes = [];
    if (fs.existsSync(logsPath)) {
      intakes = JSON.parse(fs.readFileSync(logsPath, "utf-8")).intakes || [];
    }

    const dueItems = catalog.filter(item => {
      if (!item.reminder?.enabled || item.reminder.time !== currentTime) return false;
      if (!isDueToday(item, todayStr)) return false;
      if (intakes.some(intake => intake.supplement_id === item.id)) return false;
      return !isSnoozed(baseDataDir, todayStr, item.id);
    });

    for (const item of dueItems) {
      const payload = JSON.stringify(buildSupplementPayload({
        timeOfDay: item.default_time_of_day || "any",
        names: item.name,
        dueItems: [item],
        date: todayStr,
      }));
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(sub, payload);
        } catch (err) {
          console.error("[PushScheduler] Per-supplement send failed:", err.statusCode);
        }
      }
      console.log(`[PushScheduler] Per-supplement reminder sent: ${item.name} @ ${currentTime}`);
    }
  } catch (error) {
    console.error("[PushScheduler] Error in per-supplement reminders:", error);
  }
}

async function sendDailyPrompts(promptIds, baseDataDir) {
  const subsPath = getSubscriptionsPath(baseDataDir);
  if (!fs.existsSync(subsPath)) {
    console.log(`[PushScheduler] Skipping daily prompts: no push subscriptions at ${subsPath}`);
    return;
  }

  const subscriptions = JSON.parse(fs.readFileSync(subsPath, "utf-8")) || [];
  if (subscriptions.length === 0) {
    console.log("[PushScheduler] Skipping daily prompts: push subscriptions list is empty");
    return;
  }

  for (const promptId of promptIds) {
    const payload = buildDailyPromptPayload(promptId);
    if (!payload) {
      console.log(`[PushScheduler] Unknown daily prompt: ${promptId}`);
      continue;
    }

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
      } catch (error) {
        console.error(`[PushScheduler] Daily prompt send failed for ${promptId}:`, error?.statusCode || error);
      }
    }
    console.log(
      `[PushScheduler] Daily prompt sent: ${promptId} (${subscriptions.length} subscriptions)`
    );
  }
}
