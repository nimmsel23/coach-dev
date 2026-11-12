import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
const server = await createServer({
  configFile: false, plugins: [react(), {
    name: 'coach-frame-fixture',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer?.endsWith('/ClientsPanel.jsx') && source.startsWith('./') && !['./useCoachRoute.js', './clientSubTabs.js'].includes(source)) return `\0client-leaf:${source}`;
    },
    load(id) {
      if (id.startsWith('\0client-leaf:')) return 'export default function ClientLeaf() {return null;}';
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/coach.html') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><html><body><h1>Embedded Coach fixture</h1><a href="#/clients/client-b/messages">Nachrichten B</a></body></html>');
      });
    },
  }],
  optimizeDeps: { entries: ['src/views/Coach/insights.browser.html'] },
  resolve: { alias: { '@db': resolve('src/views/Coach/insights.browser-db.js'), '@plan': resolve('modules/plan/src') } },
  server: { host: '127.0.0.1', port: 15918, strictPort: true },
});
await server.listen();
console.log('Insights fixture: http://127.0.0.1:15918/src/views/Coach/insights.browser.html');
