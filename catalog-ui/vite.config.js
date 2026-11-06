import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone Catalog-UI — Backend ist fitness/catalog/api/api.py (:9150, FastAPI).
// Dev:  Vite (:9160) proxied die API-Prefixe auf :9150.
// Prod: `npm run build` schreibt nach fitness/catalog/dist —
//       api.py served dist/ über die Catch-all-Route selbst → same-origin.
const API = 'http://127.0.0.1:9150'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../fitness/catalog/dist',
    emptyOutDir: true,
  },
  server: {
    port: 9160,
    proxy: {
      '/fitness': API,
      '/exercises': API,
      '/exercise': API,
      '/coverage': API,
      '/health': API,
    },
  },
})
