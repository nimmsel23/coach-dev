import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Standalone Catalog-UI — Backend :9150 (Coach).
// Dev: Vite :9160 proxied; Prod: build → dist-catalog (coach build:catalog-ui).
const API = 'http://127.0.0.1:9150'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
