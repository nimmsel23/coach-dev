import { createServer } from 'vite';
import { resolve } from 'node:path';
const server = await createServer({
  configFile: resolve('vite.config.js'), mode: 'development',
  optimizeDeps: { entries: ['scripts/tests/shared-editor-browser.html'] },
  resolve: { alias: { '@db': resolve('scripts/tests/shared-editor-db.js') } },
  server: { host: '127.0.0.1', port: 15903, strictPort: true },
});
await server.listen();
