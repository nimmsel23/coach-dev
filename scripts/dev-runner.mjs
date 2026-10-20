// Coach uses Firestore in the browser; do not start the inherited Fitness API.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const vite = spawn(process.execPath, [
  fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
  '--mode', 'coach', '--open', '/coach.html', ...process.argv.slice(2),
], { cwd: root, stdio: 'inherit', shell: false })
vite.on('error', error => { console.error(error.message); process.exit(1) })
vite.on('exit', (code, signal) => { process.exit(signal ? 1 : (code ?? 1)) })
process.on('SIGTERM', () => vite.kill('SIGTERM'))
process.on('SIGINT', () => vite.kill('SIGINT'))
