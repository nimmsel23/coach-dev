import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('package.json has name + engines.node', () => {
  assert.equal(typeof pkg.name, 'string')
  assert.ok(pkg.name.length > 0)
  assert.ok(pkg.engines?.node, 'engines.node fehlt')
})
