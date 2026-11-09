// DISABLED 2026-06-12
// This script previously copied src/views/{Habits,Journal}, src/lib/db,
// and src/lib/utils.js → pwa/src/*, OVERWRITING the modularized Firestore
// code in pwa/src/lib/db with the Node-API code from src/lib/db.
//
// Running this destroyed the smart-clean Firestore implementation every
// time it was invoked. Do NOT run it. The correct integration direction
// is the OPPOSITE: pwa/src/lib/db (Firestore, last good state at git
// commit 5d9086c) → src/lib/db. The pwa/ folder no longer exists.
//
// If you want UI-parity sync of just the views (not lib/db), write a new
// script that explicitly lists view directories and refuses to touch lib/.

console.error('sync-views.mjs is permanently disabled. See header comment.')
process.exit(1)
