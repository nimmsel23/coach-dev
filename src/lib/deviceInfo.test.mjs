import test from 'node:test'
import assert from 'node:assert/strict'
import { describeDevice } from './deviceInfo.js'

test('Apple-Geräte und iOS-Browser', () => {
  assert.equal(describeDevice('iPhone AppleWebKit CriOS/140 Mobile Safari/604', {}), 'Chrome · iPhone')
  assert.equal(describeDevice('iPhone AppleWebKit EdgiOS/140 Mobile Safari/604', {}), 'Edge · iPhone')
  assert.equal(describeDevice('iPad AppleWebKit FxiOS/140 Mobile Safari/604', {}), 'Firefox · iPad')
  assert.equal(describeDevice('Macintosh; Intel Mac OS X AppleWebKit Version/18 Safari/605', { platform: 'MacIntel', maxTouchPoints: 5 }), 'Safari · iPad')
  assert.equal(describeDevice('Macintosh; Intel Mac OS X AppleWebKit Version/18 Safari/605', { platform: 'MacIntel', maxTouchPoints: 0 }), 'Safari · Mac')
  assert.equal(describeDevice('iPhone AppleWebKit Mobile/15E148', {}), 'Browser · iPhone')
})

test('Android-Modelle, reduzierte UAs und unbekannte Geräte', () => {
  assert.equal(describeDevice('Linux; Android 13; Pixel 7 Build/TQ3A Chrome/120 Mobile Safari/537', {}), 'Chrome · Pixel 7 (Android)')
  assert.equal(describeDevice('Linux; Android 10; K) Chrome/140 Mobile Safari/537', {}), 'Chrome · Android')
  assert.equal(describeDevice('Linux; Android 14; de-DE; SM-S921B Build/UP1A SamsungBrowser/26 Chrome/120 Safari/537', {}), 'Samsung Internet · SM-S921B (Android)')
  assert.equal(describeDevice(null, {}), 'Browser · Gerät')
})
