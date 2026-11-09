import { sharedPlanRoot } from './scripts/shared-plan.mjs'
import { sharedFitnessRoot } from './scripts/shared-fitness-root.mjs'
import { fitnessOverlay } from './modules/plan/vite-fitness-overlay.mjs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { existsSync, readdirSync, readFileSync } from 'fs'

const BACKEND = 'http://localhost:9150'

// Coach-Build: Dateien aus dem Submodul website/ (website/coach/* und src/6pack.html) ins Hosting-Wurzelverzeichnis legen.
function websiteFiles() {
  const root = resolve(__dirname, 'website')
  return {
    name: 'coach-website-files',
    generateBundle() {
      const add = (fileName, path) => this.emitFile({ type: 'asset', fileName, source: readFileSync(path) })
      const coachDir = resolve(root, 'coach')
      if (existsSync(coachDir)) for (const f of readdirSync(coachDir)) add(f, resolve(coachDir, f))
      const page = resolve(root, 'src/6pack.html')
      if (existsSync(page)) add('6pack.html', page)
    },
  }
}

export default defineConfig(async ({ mode }) => {
  const isFirebase = mode === 'firebase' || mode === 'coach'
  const isCoach = mode === 'coach'

  return {
    publicDir: isCoach ? resolve(__dirname, 'public-coach') : resolve(__dirname, 'public'),
    // Relativ statt absolut — sonst lösen Assets unter einem Funnel-Pfad-
    // Präfix (z.B. /coach-dev/) fälschlich zur Domain-Wurzel auf (404 →
    // Whitescreen). Core4/Door/Game/Fuel haben denselben Fix schon.
    base: './',
    plugins: [fitnessOverlay({ planRoot: sharedPlanRoot(), fitnessRoot: sharedFitnessRoot() }), react(), ...(isCoach ? [websiteFiles()] : [])],
    resolve: {
      // Resolve pnpm packages from their real directory so transitive Vue imports work.
      preserveSymlinks: false,
      alias: {

        '@plan':               resolve(sharedPlanRoot(), 'src'),
        '@src':                resolve(__dirname, './src'),
        '@db':                 resolve(__dirname, './src/lib/db/index.firestore.app.js'),
        '@fitness-db':         resolve(__dirname, './src/lib/db'),
        '@utils':              resolve(__dirname, './src/lib/utils.js'),
        '@cloud/firebase.js':  resolve(__dirname, './src/firebase.js'),
        '@firebase-config':    resolve(__dirname, './firebase.config.js'),
        '@aliase':             resolve(__dirname, './fitness/catalog/kb/aliases.yml'),
        // Plan-Submodul (ab 1b4ddc93) importiert @kb/* statt Relativpfade — Alias wie in plan-dev.
        '@kb':                 resolve(__dirname, './fitness/catalog/kb'),
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
      fs: { allow: [__dirname, sharedFitnessRoot()] },
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
          '**/klienten-dev/**',
          '**/workspace/**',
          '**/__pycache__/**',
          '**/.pytest_cache/**',
          '**/catalog-ui/**',
          '**/functions/**',
          '**/fitness_agent.egg-info/**',
          '**/.git/**',
        ],
      },
      proxy: {
        '/api': BACKEND,
        '/fuel-api': BACKEND,
        '/relax-api': BACKEND,
        '/exercises': BACKEND,
        '/session':   BACKEND,
        '/journal':   BACKEND,
        '/coverage':  BACKEND,
        '/plan':      BACKEND,
        '/blocks':    BACKEND,
        '/theme':     BACKEND,
        '/health':    BACKEND,
        '/export':    BACKEND,
        '/fitness':   BACKEND,
        '/firestore': BACKEND,
        '/workouts':  BACKEND,
        '/routines':  BACKEND,
      },
    },
    build: {
      outDir: isCoach ? 'dist-coach' : 'dist',
      // Vite 8 (Rolldown) kennt 'modules' nicht mehr ([BUNDLER_INITIALIZE_ERROR]). Browserliste = altes modules-Kuerzel.
      target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
      rollupOptions: {
        input: isCoach
          ? {
              shell: resolve(__dirname, 'coach-shell.html'),
              index: resolve(__dirname, 'index.html'),
              coach: resolve(__dirname, 'coach.html'),
              local: resolve(__dirname, 'local.html'),
              clientforge: resolve(__dirname, 'clientforge.html'),
            }
          : undefined,
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            charts: ['recharts'],
            icons: ['lucide-react'],
            bodymap: ['react-body-highlighter'],
          },
        },
      },
    },
  }
})
