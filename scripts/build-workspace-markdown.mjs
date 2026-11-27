// Vanilla workspaces are served directly by Python, so keep their renderer bundled.
import { build } from 'esbuild'
await build({
  entryPoints: ['workspaces/_shared/markdown-source.js'],
  outfile: 'workspaces/_shared/markdown.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  legalComments: 'inline',
})
