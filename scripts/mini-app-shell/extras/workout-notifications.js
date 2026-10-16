// SW-Baustein "workout-notifications" (aus dem Fitness-Haupt-SW): Workout-Stoppuhr / Ruhezeit als
// Notification, gesteuert per postMessage aus der App (SHOW_WORKOUT_TIMER_NOTIFICATION,
// SHOW_WORKOUT_HOUR_REMINDER, CLEAR_WORKOUT_TIMER_NOTIFICATION). Einbinden: "sw": { "extras": ["workout-notifications"] }.
// Klick-Ziel: data.link der Notification, sonst CFG.workoutLink, sonst CFG.notificationLink.
const WORKOUT_TAG = 'fitness-workout-session'
const wnIcon = () => new URL('./icon-192.png', SCOPE).href
const wnLink = (data) => (data && data.link) || CFG.workoutLink || CFG.notificationLink || './'

self.addEventListener('message', (e) => {
  const d = e.data
  if (!d) return
  if (d.type === 'SHOW_WORKOUT_TIMER_NOTIFICATION') e.waitUntil(showWorkoutNotification(d))
  if (d.type === 'SHOW_WORKOUT_HOUR_REMINDER') e.waitUntil(showHourReminder(d))
  if (d.type === 'CLEAR_WORKOUT_TIMER_NOTIFICATION') e.waitUntil(clearWorkoutNotification(d.tag))
})

async function showWorkoutNotification(d) {
  if (!self.registration || !self.registration.showNotification) return
  await self.registration.showNotification(d.title || 'Workout läuft', {
    tag: d.tag || WORKOUT_TAG,
    renotify: false,
    silent: true,
    requireInteraction: !!d.active,
    body: d.body || 'Die Workout-Stoppuhr läuft.',
    icon: wnIcon(),
    badge: wnIcon(),
    data: { link: wnLink(d), date: d.date || null, active: !!d.active },
  })
}

async function showHourReminder(d) {
  if (!self.registration || !self.registration.showNotification) return
  await self.registration.showNotification(d.title || 'Workout läuft schon lange', {
    tag: d.tag || 'fitness-workout-hour-reminder',
    renotify: true,
    silent: false,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    body: d.body || 'Schon über eine Stunde aktiv.',
    icon: wnIcon(),
    badge: wnIcon(),
    data: { link: wnLink(d), date: d.date || null },
  })
}

async function clearWorkoutNotification(tag = WORKOUT_TAG) {
  const list = await self.registration.getNotifications({ tag })
  list.forEach((n) => n.close())
}
