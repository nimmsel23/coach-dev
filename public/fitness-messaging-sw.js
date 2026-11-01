/* global importScripts, firebase */

importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyD1hvp2UYrvizLOzoSqOX-bwRWcCpJVAlg",
  authDomain: "fitness-aos.firebaseapp.com",
  projectId: "fitness-aos",
  storageBucket: "fitness-aos.firebasestorage.app",
  messagingSenderId: "842575255284",
  appId: "1:842575255284:web:65c4831683a893c110f0a1",
});

const messaging = firebase.messaging();

const DEFAULT_LINK = "/?tab=session";
const MAX_TRACKED_SIDS = 20;

// Klienten-Workout (functions/clientWorkout.js): ein Tag pro Klient. Kommt ein
// weiteres Workout desselben Klienten, bevor die Meldung weggewischt wurde,
// wird sie zu "N neue Workouts" zusammengefasst statt zu stapeln. Ein Update
// derselben Session (gleiche sid) ersetzt still, ohne erneut zu klingeln.
async function showClientWorkout(data) {
  const tag = data.tag || `client-workout-${data.clientUid || "unbekannt"}`;
  const existing = await self.registration.getNotifications({ tag });
  const previous = existing[0]?.data || {};
  const known = Array.isArray(previous.sids) ? previous.sids : [];
  const isNewSession = Boolean(data.sid) && !known.includes(data.sid);
  const sids = isNewSession ? [...known, data.sid].slice(-MAX_TRACKED_SIDS) : known;
  const count = Math.max(sids.length, 1);
  const name = data.clientName || "Klient";

  await self.registration.showNotification(
    count > 1 ? `${name}: ${count} neue Workouts` : data.title || `${name}: Workout eingegangen`,
    {
      body: data.body || "Neue Session",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
      renotify: isNewSession && existing.length > 0,
      actions: [
        { action: "open", title: "Öffnen" },
        { action: "seen", title: "Gesehen" },
      ],
      data: {
        type: "clientWorkout",
        link: data.link || DEFAULT_LINK,
        clientUid: data.clientUid || "",
        sid: data.sid || "",
        sids,
        count,
      },
    },
  );
}

async function showReminder(payload) {
  const data = payload?.data || {};
  const title = data.title || payload?.notification?.title || "Fitness";
  const body = data.body || payload?.notification?.body || "Zeit für deinen nächsten Check-in.";
  const link = data.link || DEFAULT_LINK;

  await self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // data.tag kommt von functions/index.js — gleicher Tag ersetzt die
    // vorherige Notification statt zu stapeln (renotify bewusst aus).
    tag: `fitness-${data.tag || "reminder"}`,
    renotify: false,
    data: { link, tab: data.tab || "session" },
  });
}

messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {};
  if (data.app !== "fitness") return;
  return data.type === "clientWorkout" ? showClientWorkout(data) : showReminder(payload);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // "Gesehen" schließt nur die Meldung, öffnet aber nichts.
  if (event.action === "seen") return;

  const link = event.notification?.data?.link || DEFAULT_LINK;
  // Klienten-Workouts verlinken auf die Coach-Site (andere Origin): dort ein
  // schon offenes Fenster nutzen, sonst neues öffnen. Same-origin-Links
  // behalten das bisherige Verhalten (irgendein offenes App-Fenster navigieren).
  const target = new URL(link, self.location?.origin || "https://fitness-aos.web.app");
  const sameOrigin = target.origin === (self.location?.origin || target.origin);

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if (!("focus" in client)) continue;
      if (!sameOrigin && !String(client.url || "").startsWith(target.origin)) continue;
      try {
        await client.navigate(sameOrigin ? link : target.href);
      } catch {}
      return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(sameOrigin ? link : target.href);
    return null;
  })());
});
