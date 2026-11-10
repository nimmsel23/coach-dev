// tc-cors-proxy — CORS-Proxy vor dem taskchampion-sync-server (nur Header, Daten bleiben E2E-verschlüsselt).
// Erlaubt Browser-Clients (Door v2 auf vos-door.web.app) den Sync über den Tailscale-Funnel.
import http from 'node:http'

const LISTEN = Number(process.env.TC_PROXY_PORT || 53590)
const UPSTREAM = { host: '127.0.0.1', port: Number(process.env.TC_UPSTREAM_PORT || 53589) }
const ORIGINS = (
  process.env.TC_ORIGINS ||
  'https://vitalos.web.app,https://vos-door.web.app,https://vos-voice.web.app,https://vos-game.web.app,https://vos-tent.web.app,https://vos-journal.web.app,https://journal-vos.web.app,http://localhost:5173,http://localhost:4173'
).split(',')

const cors = (origin) =>
  ORIGINS.includes(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id, X-Client-Version',
        'Access-Control-Expose-Headers': 'X-Version-Id, X-Parent-Version-Id, X-Snapshot-Request',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : {}

http
  .createServer((req, res) => {
    const headers = cors(req.headers.origin)
    if (req.method === 'OPTIONS') {
      res.writeHead(Object.keys(headers).length ? 204 : 403, headers)
      return res.end()
    }
    const up = http.request({ ...UPSTREAM, method: req.method, path: req.url, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode, { ...r.headers, ...headers })
      r.pipe(res)
    })
    up.on('error', () => {
      res.writeHead(502, headers)
      res.end()
    })
    req.pipe(up)
  })
  .listen(LISTEN, '127.0.0.1', () => console.log(`tc-cors-proxy :${LISTEN} → :${UPSTREAM.port}`))
