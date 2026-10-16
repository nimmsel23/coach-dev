import { createServer } from 'vite';
import { resolve } from 'node:path';
const backend = 'http://127.0.0.1:15915';
const server = await createServer({
  configFile: resolve('vite.config.js'), mode: 'development',
  resolve: { alias: { '@db': resolve('scripts/tests/coach-browser-db.js') } },
  server: { host: '127.0.0.1', port: 15903, strictPort: true,
    proxy: { '/api': backend, '/fitness': { target: backend, bypass: (req) => req.url.startsWith('/fitness/catalog/') ? req.url : undefined } } },
});
await server.listen();
console.log('Coach browser harness ready: 15903');
