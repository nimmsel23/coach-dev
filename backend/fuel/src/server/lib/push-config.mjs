import fs from "fs";
import path from "path";

export const DEFAULT_PUSH_SETTINGS = {
  supplements: {
    enabled: true,
    times: {
      morning: "08:00",
      midday: "13:00",
      evening: "19:00",
      night: "21:00",
    },
  },
  daily_prompts: {
    fuel_quick_log: {
      enabled: true,
      time: "09:30",
    },
    journal_entry: {
      enabled: true,
      time: "20:30",
    },
  },
};

const DAILY_PROMPT_DEFINITIONS = {
  fuel_quick_log: {
    id: "fuel_quick_log",
    title: "Fuel Quick Log",
    body: "Tippe dein Essen frei ein und lass Fuel direkt daraus einen Log bauen.",
    tag: "fuel-daily-quick-log",
    url: buildIntentUrl({
      tab: "dashboard",
      date: "today",
      intent: "fuel.quick-log",
      focus: "quick-ai-log",
    }),
    actions: [
      {
        action: "open-quick-log",
        title: "Quick Log",
        url: buildIntentUrl({
          tab: "dashboard",
          date: "today",
          intent: "fuel.quick-log",
          focus: "quick-ai-log",
        }),
      },
      {
        action: "open-log-tab",
        title: "Log",
        url: buildIntentUrl({
          tab: "log",
          date: "today",
          intent: "fuel.quick-log",
          focus: "quick-ai-log",
        }),
      },
      {
        action: "open-journal",
        title: "Journal",
        url: buildIntentUrl({
          tab: "log",
          date: "today",
          intent: "journal.quick-entry",
          focus: "journal-notes",
        }),
      },
    ],
    meta: {
      app: "fuel",
      feature: "quick-log",
      reply_mode: "deep-link",
    },
  },
  journal_entry: {
    id: "journal_entry",
    title: "Daily Journal",
    body: "Ein kurzer Tagescheck-in reicht. Schlaf, Befinden, Hunger, Training oder Energie.",
    tag: "fuel-daily-journal",
    url: buildIntentUrl({
      tab: "log",
      date: "today",
      intent: "journal.quick-entry",
      focus: "journal-notes",
    }),
    actions: [
      {
        action: "open-journal",
        title: "Jetzt schreiben",
        url: buildIntentUrl({
          tab: "log",
          date: "today",
          intent: "journal.quick-entry",
          focus: "journal-notes",
        }),
      },
      {
        action: "open-food",
        title: "Food Log",
        url: buildIntentUrl({
          tab: "food",
          date: "today",
          intent: "fuel.quick-log",
          focus: "quick-ai-log",
        }),
      },
    ],
    meta: {
      app: "journal",
      feature: "entry",
      reply_mode: "deep-link",
    },
  },
};

export function getSubscriptionsPath(baseDataDir) {
  return path.join(baseDataDir, "push-subscriptions.json");
}

export function getSettingsPath(baseDataDir) {
  return path.join(baseDataDir, "push-settings.json");
}

export function loadSubscriptions(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (error) {
    console.error("[push-config] Failed to load subscriptions:", error);
  }
  return [];
}

export function saveSubscriptions(filePath, subscriptions) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(subscriptions, null, 2));
}

export function loadPushSettings(baseDataDir) {
  const settingsPath = getSettingsPath(baseDataDir);
  try {
    if (!fs.existsSync(settingsPath)) return DEFAULT_PUSH_SETTINGS;
    return normalizePushSettings(JSON.parse(fs.readFileSync(settingsPath, "utf-8")));
  } catch (error) {
    console.error("[push-config] Failed to load push settings:", error);
    return DEFAULT_PUSH_SETTINGS;
  }
}

export function savePushSettings(baseDataDir, settings) {
  fs.mkdirSync(baseDataDir, { recursive: true });
  fs.writeFileSync(getSettingsPath(baseDataDir), JSON.stringify(settings, null, 2));
}

export function normalizePushSettings(input) {
  const legacySupplements = input?.supplements || {
    enabled: input?.enabled,
    times: input?.times,
  };

  return {
    supplements: {
      enabled: legacySupplements?.enabled ?? DEFAULT_PUSH_SETTINGS.supplements.enabled,
      times: {
        morning: sanitizeTime(legacySupplements?.times?.morning, DEFAULT_PUSH_SETTINGS.supplements.times.morning),
        midday: sanitizeTime(legacySupplements?.times?.midday, DEFAULT_PUSH_SETTINGS.supplements.times.midday),
        evening: sanitizeTime(legacySupplements?.times?.evening, DEFAULT_PUSH_SETTINGS.supplements.times.evening),
        night: sanitizeTime(legacySupplements?.times?.night, DEFAULT_PUSH_SETTINGS.supplements.times.night),
      },
    },
    daily_prompts: {
      fuel_quick_log: {
        enabled: Boolean(input?.daily_prompts?.fuel_quick_log?.enabled ?? DEFAULT_PUSH_SETTINGS.daily_prompts.fuel_quick_log.enabled),
        time: sanitizeTime(input?.daily_prompts?.fuel_quick_log?.time, DEFAULT_PUSH_SETTINGS.daily_prompts.fuel_quick_log.time),
      },
      journal_entry: {
        enabled: Boolean(input?.daily_prompts?.journal_entry?.enabled ?? DEFAULT_PUSH_SETTINGS.daily_prompts.journal_entry.enabled),
        time: sanitizeTime(input?.daily_prompts?.journal_entry?.time, DEFAULT_PUSH_SETTINGS.daily_prompts.journal_entry.time),
      },
    },
  };
}

export function getDailyPromptDefinitions() {
  return DAILY_PROMPT_DEFINITIONS;
}

export function buildDailyPromptPayload(promptId) {
  const prompt = DAILY_PROMPT_DEFINITIONS[promptId];
  if (!prompt) return null;
  return {
    title: prompt.title,
    body: prompt.body,
    icon: "/favicon-192x192.png",
    badge: "/favicon-192x192.png",
    tag: prompt.tag,
    requireInteraction: false,
    renotify: false,
    url: prompt.url,
    actions: prompt.actions,
    meta: {
      kind: "daily_prompt",
      prompt_id: prompt.id,
      ...prompt.meta,
    },
  };
}

export function buildSupplementPayload({ timeOfDay, names, dueItems = [], date }) {
  return {
    title: `Time for your ${timeOfDay} Supplements`,
    body: `Noch offen: ${names}`,
    icon: "/favicon-192x192.png",
    badge: "/favicon-192x192.png",
    tag: `fuel-supplements-${timeOfDay}`,
    requireInteraction: true,
    url: buildIntentUrl({
      tab: "supplements",
      date: "today",
      intent: "supplements.daily-checklist",
      focus: "supplements-checklist",
    }),
    // Zwei Quick-Actions statt Deep-Links: "Ja" loggt alle faelligen Items
    // direkt aus dem SW heraus (kein App-Open noetig), "Spaeter" snoozed sie
    // fuer 30min — beide Branches werden im SW's notificationclick behandelt,
    // nicht ueber die url-Navigation wie die uebrigen Reminder-Typen.
    actions: [
      { action: "quick-yes", title: "✓ Ja, genommen" },
      { action: "snooze", title: "⏰ Später" },
    ],
    meta: {
      kind: "supplement_reminder",
      time_of_day: timeOfDay,
      due_names: names,
      due_items: dueItems.map((item) => ({
        id: item.id,
        name: item.name,
        dose: item.default_dose ?? 0,
        unit: item.unit || "",
        time_of_day: item.default_time_of_day || timeOfDay,
      })),
      date: date || null,
      app: "habits",
      feature: "supplements",
    },
  };
}

export function buildIntentUrl({ tab, date = "today", intent, focus, draft }) {
  const params = new URLSearchParams();
  if (tab) params.set("notificationTab", tab);
  if (date) params.set("notificationDate", date);
  if (intent) params.set("notificationIntent", intent);
  if (focus) params.set("notificationFocus", focus);
  if (draft) params.set("notificationDraft", draft);
  const query = params.toString();
  const hash = tab ? `#${tab}/${date}` : "";
  return `/${query ? `?${query}` : ""}${hash}`;
}

export function sanitizeTime(value, fallback) {
  const next = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(next) ? next : fallback;
}
