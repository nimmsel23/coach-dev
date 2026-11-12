import { createServer } from 'vite'
import { resolve } from 'node:path'

const server = await createServer({
  configFile: resolve('vite.config.js'),
  mode: 'development',
  resolve: { alias: { '@db': resolve('scripts/tests/feed-highlight-fixture-db.js') } },
  server: { host: '127.0.0.1', port: 15906, strictPort: true },
})
await server.listen()
console.log('feed-highlight fixture on http://127.0.0.1:15906/scripts/tests/feed-highlight-browser.html')
