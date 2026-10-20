// Coach owns its Firebase Hosting release; local service deploys are unsupported.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
let mode = process.env.npm_config_mode || 'firebase'
if (mode === 'true') mode = 'firebase'
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--mode') {
    if (!args[i + 1]) { console.error('Missing --mode value.'); process.exit(2) }
    mode = args[++i]
  } else if (arg.startsWith('--mode=')) {
    mode = arg.slice('--mode='.length)
  } else if (['firebase', 'local', 'desktop', 'staging', 'prod'].includes(arg)) {
    mode = arg
  } else {
    console.error(`Unknown deploy argument: ${arg}`)
    process.exit(2)
  }
}
if (mode !== 'firebase') {
  console.error('Coach supports Firebase Hosting deployment only. Use npm run dev for local development.')
  process.exit(1)
}
const root = fileURLToPath(new URL('../', import.meta.url))
const child = spawn('npm', ['run', 'firebase'], { cwd: root, stdio: 'inherit', shell: false })
child.on('error', error => { console.error(error.message); process.exit(1) })
child.on('exit', (code, signal) => { process.exit(signal ? 1 : (code ?? 1)) })
