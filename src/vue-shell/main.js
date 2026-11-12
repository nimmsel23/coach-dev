import { createApp, h, onMounted, onBeforeUnmount, ref } from 'vue'
import { syncFrameRoute } from './frameRoute.js'
import './style.css'

const coachAppUrl = new URL('./coach.html', window.location.href).pathname
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
const coachFrameUrl = `${coachAppUrl}${window.location.hash}`
const localAppUrl = new URL('./local.html', window.location.href).pathname

const CoachFrame = {
  setup() {
    const frame = ref(null)
    const routeHash = ref(window.location.hash)
    let stopSync
    onMounted(() => {
      if (!isLocal) stopSync = syncFrameRoute(frame.value, window, (hash) => { routeHash.value = hash })
    })
    onBeforeUnmount(() => stopSync?.())
    return { frame, routeHash }
  },
  render() {
    return h('div', { class: 'coach-frame' }, [
      h('header', { class: 'coach-frame__header' }, [
        h('div', { class: 'coach-frame__identity' }, [
          h('span', { class: 'coach-frame__eyebrow' }, 'VitalOS'),
          h('h1', 'Coach'),
        ]),
        isLocal ? h('span', { class: 'coach-frame__open', 'aria-label': 'Lokaler Arbeitsbereich' }, 'Lokal · Klienten & Planung') : null,
        isLocal ? h('a', { class: 'coach-frame__open', href: `${coachAppUrl}#/traction` }, 'Fitness-Nutzung') : null,
        isLocal ? h('a', { class: 'coach-frame__open', href: coachAppUrl }, 'Cloud Coach') : null,
        h('a', {
          class: 'coach-frame__open',
          href: isLocal ? localAppUrl : `${coachAppUrl}${this.routeHash}`,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, [
          h('span', isLocal ? 'Arbeitsplatz öffnen' : 'Direkt öffnen'),
          h('svg', { 'aria-hidden': 'true', viewBox: '0 0 16 16', fill: 'none' }, [
            h('path', {
              d: 'M6 3h7v7M13 3 7 9',
              stroke: 'currentColor',
              'stroke-width': '1.5',
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            }),
            h('path', {
              d: 'M11 9v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3',
              stroke: 'currentColor',
              'stroke-width': '1.5',
              'stroke-linecap': 'round',
            }),
          ]),
        ]),
      ]),
      h('main', { class: 'coach-frame__content' }, [
        h('iframe', {
          ref: 'frame',
          src: isLocal ? localAppUrl : coachFrameUrl,
          title: isLocal ? 'Lokale Vital Coach Konsole' : 'Coach-Anwendung',
          allow: 'clipboard-read; clipboard-write',
          referrerpolicy: 'same-origin',
        }),
      ]),
    ])
  },
}

createApp(CoachFrame).mount('#coach-shell')
