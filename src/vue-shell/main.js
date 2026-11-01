import { createApp, h } from 'vue'
import './style.css'

const coachAppUrl = new URL('./coach.html', window.location.href).pathname

const CoachFrame = {
  render() {
    return h('div', { class: 'coach-frame' }, [
      h('header', { class: 'coach-frame__header' }, [
        h('div', { class: 'coach-frame__identity' }, [
          h('span', { class: 'coach-frame__eyebrow' }, 'VitalOS'),
          h('h1', 'Coach'),
        ]),
        ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) ? h('a', { class: 'coach-frame__open', href: new URL('./clientforge.html', window.location.href).pathname }, 'ClientForge') : null,
        h('a', {
          class: 'coach-frame__open',
          href: coachAppUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, [
          h('span', 'Direkt öffnen'),
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
          src: coachAppUrl,
          title: 'Coach-Anwendung',
          allow: 'clipboard-read; clipboard-write',
          referrerpolicy: 'same-origin',
        }),
      ]),
    ])
  },
}

createApp(CoachFrame).mount('#coach-shell')
