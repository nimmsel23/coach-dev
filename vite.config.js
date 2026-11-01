import { vosChangelog } from './scripts/vos-changelog/vos-changelog-vite.mjs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, isAbsolute, relative, resolve, sep } from 'path'
import { existsSync } from 'fs'
import { miniAppSubmodulePlugin } from './vite-miniapp-submodules.mjs'

const BACKEND = 'http://localhost:9150'

// Sibling-Repos existieren unter zwei Namen, je nach Checkout-Kontext:
// ~/<name>-dev (Home-Root, dev-Branch-Arbeitskopie) oder
// ~/vitalos/<name>-app (vitalos-Submodule, master-Branch, "habit-app" ist Singular).
// Diese Datei ist in beiden Checkouts identisch (gleiches Repo) — ein hartcodierter
// Pfad kann nur in einem der beiden Kontexte stimmen. Deshalb zur Build-Zeit prüfen,
// welches Sibling tatsächlich existiert, statt es fest zu verdrahten.
function siblingDir(devName, appName) {
  for (const parent of ['..', '../..', '../../..']) {
    for (const name of [appName, devName]) {
      const candidate = resolve(__dirname, parent, name)
      if (existsSync(candidate)) return candidate
    }
  }
  return resolve(__dirname, '..', devName)
}


// SSOT für Cross-App-Aliase (@relax, @learn + interne Cross-DB-Exports)
// ist @vos/cross-app-aliases (~/vitalos/packages/cross-app-aliases) —
// nur erreichbar, wenn dieses Repo als vitalos-Submodule genestet ist (npm
// Workspace-Symlink). Standalone-Checkout (~/dev/fitness-dev ohne vitalos-Parent)
// fällt auf die alte siblingDir()-Auflösung zurück.
async function resolveCrossAppAliases() {
  try {
    const { crossAppAliases } = await import('@vos/cross-app-aliases')
    return crossAppAliases()
  } catch {
    return {
      '@relax':      resolve(siblingDir('relax-dev', 'relax-app'), 'src'),
      '@learn':      resolve(siblingDir('learn-dev', 'learn-app'), 'src'),
    }
  }
}

// Solo-Builds (mode 'training' | 'atlas'): Views, die dort unerreichbar sind, durch einen leeren
// Platzhalter ersetzen, damit sie samt Abhängigkeiten nicht im Bundle landen. Bewusst
// ein Build-Plugin statt lazy()-Imports: so bleibt die normale App unverändert.
const SOLO_APP_VIEWS = ['Session', 'WeeklyReview', 'Touren', 'Exercises', 'Settings', 'Anamnese', 'Fokus', 'Inbox']
const SOLO_KEEP = { training: ['Session'], atlas: ['Exercises'] }
function soloStubs(mode) {
  const stubbed = SOLO_APP_VIEWS.filter((v) => !SOLO_KEEP[mode].includes(v)).join('|')
  return [
    { importer: /[\\/]src[\\/]App\.jsx$/, source: new RegExp(`^(\\./views/(${stubbed})/index\\.jsx?$|@learn/views/Learn/)`) },
    // Plan lebt im Solo-Build auf vos-plan.web.app
    { importer: /[\\/]views[\\/]Session[\\/]index\.jsx$/, source: /^\.\.\/Plan\/index\.jsx$/ },
    // ~1,8 MB wger/yuhonas-Rohimport; yuhonas liefert dort der Geräte-Mirror
    { importer: /[\\/]lib[\\/]db[\\/]firestore[\\/]kb\.js$/, source: /^\.\/exerciseBulkData\.generated\.js$/, target: 'src/solo-bulk-stub.js' },
  ]
}
function soloStubPlugin(mode) {
  const defaultStub = resolve(__dirname, 'src/solo-stub.jsx')
  const rules = soloStubs(mode)
  return {
    name: 'solo-stub-views',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null
      const hit = rules.find((r) => r.importer.test(importer) && r.source.test(source))
      return hit ? (hit.target ? resolve(__dirname, hit.target) : defaultStub) : null
    },
  }
}

export default defineConfig(async ({ mode }) => {
  const isFirebase = mode === 'firebase' || mode === 'coach' || mode === 'training' || mode === 'atlas' || mode === 'plan'
  const isCoach = mode === 'coach'
  const isPlan = mode === 'plan'
  const isSolo = mode === 'training' || mode === 'atlas'
  const crossAppAliases = await resolveCrossAppAliases()
  delete crossAppAliases['@fuel']

  return {
    // Relativ statt absolut — sonst lösen Assets unter einem Funnel-Pfad-
    // Präfix (z.B. /fitness-dev/) fälschlich zur Domain-Wurzel auf (404 →
    // Whitescreen). Core4/Door/Game/Fuel haben denselben Fix schon.
    base: './',
    plugins: [vosChangelog({ appId: isSolo || isPlan ? mode : 'fitness', appName: isSolo || isPlan ? ({ training: 'Training', atlas: 'Atlas', plan: 'Plan' })[mode] : 'Fitness', accent: '#60a5fa' }), react(), miniAppSubmodulePlugin(), ...(isSolo ? [soloStubPlugin(mode)] : [])],
    resolve: {
      preserveSymlinks: true,
      alias: {
        ...crossAppAliases,

        '@src':                resolve(__dirname, './src'),
        '@db':                 resolve(__dirname, isFirebase ? './src/lib/db/index.firestore.app.js' : './src/lib/db/index.js'),
        '@tours-strava':       resolve(__dirname, isFirebase ? './src/lib/tours/adapters/live/strava.firestore.js' : './src/lib/tours/adapters/live/strava.js'),
        '@fitness-db':         resolve(__dirname, './src/lib/db'),
        '@utils':              resolve(__dirname, './src/lib/utils.js'),
        '@cloud/firebase.js':  resolve(__dirname, './src/firebase.js'),
        '@firebase-config':    resolve(__dirname, './firebase.config.js'),
        '@aliase':             resolve(__dirname, './fitness/catalog/kb/aliases.yml'),
        '@fitness/components': resolve(__dirname, './src/components'),
        '@fitness/constants':  resolve(__dirname, './src/constants'),
        '@fitness':            resolve(__dirname, './src'),
        '@components':         resolve(__dirname, './src/components'),
      },
      // Singleton-Dedup: sibling apps bringen eigene node_modules mit — Vite
      // muss React/Firebase trotzdem als Einzelinstanz auflösen.
      dedupe: ['react', 'react-dom', '@tanstack/react-query', 'firebase', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
    },
    server: {
      port: 5902,
      watch: {
        ignored: [
          '**/dist/**',
          '**/dist-*/**',
          '**/.firebase/**',
          '**/node_modules/**',
          '**/cloud_chamber/vitalos/**',
          '**/cloud_chamber/fitness-dev/**',
          // Python-/Build-/Nested-App-Bäume — kein Frontend-Code, aber viele
          // Dateien (u.a. .venv: 3300+, katalog-ui: 145M node_modules) die
          // chokidar sonst mitüberwacht und den Vite-Dev-Server irgendwann
          // (OOM/EMFILE) abschmieren lassen (beobachtet 2026-09-02).
          '**/.venv/**',
          '**/.worktrees/**',
          '**/__pycache__/**',
          '**/.pytest_cache/**',
          '**/catalog-ui/**',
          '**/functions/**',
          '**/fitness_agent.egg-info/**',
          '**/.git/**',
        ],
      },
      proxy: {
        '/tours/strava': `http://127.0.0.1:${process.env.FITNESS_NODE_PORT || 9100}`,
        '/sixpack': `http://127.0.0.1:${process.env.FITNESS_NODE_PORT || 9100}`,
        '/exercises': BACKEND,
        '/session':   BACKEND,
        '/journal':   BACKEND,
        '/coverage':  BACKEND,
        '/plan':      BACKEND,
        '/api':       BACKEND,
        '/blocks':    BACKEND,
        '/theme':     BACKEND,
        '/health':    BACKEND,
        '/export':    BACKEND,
        // /fitness/catalog/** sind Quell-Module (KB-YAML per ?raw/import.meta.glob in
        // src/lib/kb/muscles.js), keine API — ohne bypass landeten sie beim Backend
        // und kamen als HTML zurück (Whitescreen der ganzen App im Dev-Server).
        '/fitness': {
          target: BACKEND,
          bypass: (req) => (req.url.startsWith('/fitness/catalog/') ? req.url : undefined),
        },
        '/firestore': BACKEND,
        '/workouts':  BACKEND,
        '/routines':  BACKEND,
      },
    },
    // Dep-Scan nur über die echten Einstiegsseiten: Vite scannt sonst JEDE
    // index.html im Projekt (dist-versions/ allein ~56 Snapshots) → esbuild lief
    // minutenlang bei ~100 % CPU / >1 GB RAM.
    optimizeDeps: {
      entries: ['index.html', 'coach.html', 'plan.html'],
    },
    build: {
      outDir: isCoach ? 'dist-coach' : (isSolo || isPlan) ? `dist-${mode}` : 'dist',
      target: 'modules',
      rollupOptions: {
        input: isCoach ? resolve(__dirname, 'coach.html') : isPlan ? resolve(__dirname, 'plan.html') : undefined,
        output: {
          // Vendor-Pakete in eigene, getrennt gecachte Chunks: ein App-Update lädt
          // so nicht jedes Mal Firebase/Charts neu. Per Funktion statt Objekt, weil
          // die Pakete transitive Abhängigkeiten haben (@firebase/*, d3-*, ...).
          manualChunks(id) {
            const m = id.match(/[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?((?:@[^\\/]+[\\/])?[^\\/]+)/)
            if (!m) return undefined
            const pkg = m[1].replace(/\\/g, '/')
            if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'react'
            if (pkg === 'lucide-react') return 'icons'
            if (pkg === 'react-body-highlighter') return 'bodymap'
            if (pkg === 'firebase' || pkg.startsWith('@firebase/')) return 'firebase'
            if (pkg === 'recharts' || pkg.startsWith('d3-') || pkg === 'victory-vendor' || pkg === 'internmap'
              || pkg === 'decimal.js-light' || pkg === 'es-toolkit') return 'charts'
            return undefined
          },
        },
      },
    },
  }
})
