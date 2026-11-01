import { createServer } from 'vite';
import { resolve } from 'node:path';
const clientRoot = process.env.FITNESS_SOURCE || resolve('../fitness-dev');
const server = await createServer({
  configFile: resolve('vite.config.js'), mode: 'development',
  plugins: [{ name: 'communication-fixtures', enforce: 'pre', resolveId(id, importer = '') {
    if (id === '/@client-conversation') return resolve(clientRoot, 'src/views/Inbox/CoachConversation.jsx');
    if (id === './core.js' && importer.endsWith('/firestore/communication.js')) return resolve('scripts/tests/communication-fixture-coach.js');
    if (id === '../firebase.js' && importer.endsWith('/lib/coachConversation.js')) return resolve('scripts/tests/communication-fixture-client.js');
    if (id === './trainingProgramStore.js' && importer.endsWith('/ClientMessages.jsx')) return resolve('scripts/tests/communication-fixture-plans.js');
  } }],
  optimizeDeps: { entries: ['scripts/tests/communication-browser.html'] },
  resolve: { alias: { '@db': resolve('scripts/tests/communication-fixture-coach.js') } },
  server: { host: '127.0.0.1', port: 15905, strictPort: true, fs: { allow: [resolve('.'), clientRoot] } },
});
await server.listen();
