// Prüft public/firebase-messaging-sw.js ohne Browser: Die Datei läuft in einer
// vm mit nachgebautem ServiceWorker-Global. Aufruf: node scripts/test-push-sw.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['public/firebase-messaging-sw.js']

function loadSw(file, windows) {
  const shown = []
  const open = []
  const listeners = {}
  let onBackground = null
  const self = {
    location: { origin: 'https://fitness-aos.web.app' },
    registration: {
      showNotification: async (title, options) => {
        shown.push({ title, options })
        open.splice(0, open.length, ...open.filter((n) => n.tag !== options.tag), { tag: options.tag, data: options.data })
      },
      getNotifications: async ({ tag }) => open.filter((n) => n.tag === tag),
    },
    addEventListener: (type, fn) => { listeners[type] = fn },
    clients: {
      matchAll: async () => self.windows || [],
      openWindow: async (url) => { self.opened = url },
    },
  }
  const context = {
    self,
    importScripts: () => {},
    URL,
    firebase: {
      initializeApp: () => {},
      messaging: () => ({ onBackgroundMessage: (fn) => { onBackground = fn } }),
    },
  }
  vm.runInNewContext(readFileSync(join(root, file), 'utf8'), context, { filename: file })
  self.windows = windows
  return {
    shown,
    push: (data) => onBackground({ data }),
    navigated: () => (windows || []).map((w) => w.navigatedTo),
    focused: () => (windows || []).map((w) => w.focused),
    click: async (action, data) => {
      const waits = []
      let closed = false
      await listeners.notificationclick({
        action, notification: { data, close: () => { closed = true } },
        waitUntil: (p) => waits.push(p),
      })
      await Promise.all(waits)
      return { closed, opened: self.opened }
    },
  }
}

const wk = (sid, extra = {}) => ({
  type: 'clientWorkout', title: 'Matthias: Workout eingegangen', body: 'Kraft · 45 min',
  tag: 'client-workout-U1', clientUid: 'U1', clientName: 'Matthias', sid, link: '/#/coach?client=U1', ...extra,
})

for (const file of files) {
  console.log(`\n${file}`)
  const t = (name, fn) => fn().then(() => console.log(`  ✔ ${name}`), (e) => { console.error(`  ✘ ${name}\n`, e); process.exitCode = 1 })

  await t('Klienten-Workout: Buttons, Tag pro Klient, Link', async () => {
    const sw = loadSw(file)
    await sw.push(wk('s1'))
    const { title, options } = sw.shown[0]
    assert.equal(title, 'Matthias: Workout eingegangen')
    assert.equal(options.tag, 'client-workout-U1')
    assert.deepEqual(Array.from(options.actions, (a) => a.action), ['open', 'seen'])
    assert.equal(options.data.link, '/#/coach?client=U1')
    assert.equal(options.renotify, false)
  })

  await t('zweites Workout desselben Klienten wird zusammengefasst und klingelt', async () => {
    const sw = loadSw(file)
    await sw.push(wk('s1'))
    await sw.push(wk('s2', { body: 'Cardio · 30 min' }))
    const { title, options } = sw.shown[1]
    assert.equal(title, 'Matthias: 2 neue Workouts')
    assert.equal(options.data.count, 2)
    assert.equal(options.renotify, true)
    assert.equal(options.body, 'Cardio · 30 min')
  })

  await t('Update derselben Session zählt nicht doppelt und klingelt nicht', async () => {
    const sw = loadSw(file)
    await sw.push(wk('s1'))
    await sw.push(wk('s1', { title: 'Matthias: Workout abgeschlossen' }))
    const { title, options } = sw.shown[1]
    assert.equal(title, 'Matthias: Workout abgeschlossen')
    assert.equal(options.data.count, 1)
    assert.equal(options.renotify, false)
  })

  await t('andere Klienten bleiben getrennt', async () => {
    const sw = loadSw(file)
    await sw.push(wk('s1'))
    await sw.push(wk('s9', { tag: 'client-workout-U2', clientUid: 'U2', clientName: 'Jakob', title: 'Jakob: Workout eingegangen' }))
    assert.equal(sw.shown[1].title, 'Jakob: Workout eingegangen')
    assert.equal(sw.shown[1].options.data.count, 1)
  })

  await t('normale Reminder laufen unverändert (Tag, kein Renotify, keine Buttons)', async () => {
    const sw = loadSw(file)
    await sw.push({ title: 'Workout Reminder', body: 'Zeit!', tag: 'fitness-reminder', link: '/?tab=session' })
    const { title, options } = sw.shown[0]
    assert.equal(title, 'Workout Reminder')
    assert.equal(options.tag, 'fitness-reminder')
    assert.equal(options.renotify, false)
    assert.equal(options.actions, undefined)
  })

  await t('"Gesehen" schließt nur, "Öffnen" öffnet den Link', async () => {
    const sw = loadSw(file)
    const seen = await sw.click('seen', { link: '/#/coach?client=U1' })
    assert.deepEqual(seen, { closed: true, opened: undefined })
    const opened = await sw.click('open', { link: '/#/coach?client=U1' })
    assert.deepEqual(opened, { closed: true, opened: '/#/coach?client=U1' })
  })
}

const COACH = 'https://vos-coach.web.app/#/clients/U1?date=2026-10-15'
const win = (url) => ({ url, navigatedTo: null, focused: false, focus() { this.focused = true }, async navigate(u) { this.navigatedTo = u } })
for (const file of files) {
  console.log(`\n${file} (Coach-Site)`)
  const t = (name, fn) => fn().then(() => console.log(`  ✔ ${name}`), (e) => { console.error(`  ✘ ${name}\n`, e); process.exitCode = 1 })

  await t('fremde Origin ohne offenes Coach-Fenster: neues Fenster, App-Fenster bleibt unberührt', async () => {
    const app = win('https://fitness-aos.web.app/')
    const sw = loadSw(file, [app])
    const r = await sw.click('open', { link: COACH })
    assert.equal(r.opened, COACH)
    assert.equal(app.navigatedTo, null)
    assert.equal(app.focused, false)
  })

  await t('offenes Coach-Fenster wird navigiert und fokussiert', async () => {
    const coach = win('https://vos-coach.web.app/#/clients')
    const sw = loadSw(file, [win('https://fitness-aos.web.app/'), coach])
    const r = await sw.click('open', { link: COACH })
    assert.equal(r.opened, undefined)
    assert.equal(coach.navigatedTo, COACH)
    assert.equal(coach.focused, true)
  })
}
