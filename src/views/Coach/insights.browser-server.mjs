import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
const server = await createServer({
  configFile: false, plugins: [react()],
  optimizeDeps: { entries: ['src/views/Coach/insights.browser.html'] },
  resolve: { alias: { '@db': resolve('src/views/Coach/insights.browser-db.js') } },
  server: { host: '127.0.0.1', port: 15918, strictPort: true },
});
await server.listen();
console.log('Insights fixture: http://127.0.0.1:15918/src/views/Coach/insights.browser.html');
