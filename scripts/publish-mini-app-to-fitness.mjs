#!/usr/bin/env node

// Kept as a compatibility target for existing mini-app pre-push hooks.
// Fitness now consumes its Git submodules on the `fitness` integration branch;
// a push to a mini-app's `dev` branch must not copy an unreviewed snapshot into
// Fitness.

const appName = process.argv[2];
const sourceCommit = process.argv[3];
const integrations = {
  sixpack: { label: '6Pack', path: '6pack' },
  plan: { label: 'Plan', path: 'plan' },
  skills: { label: 'Skills', path: 'Skills' },
};

const app = integrations[appName];
if (!app || !sourceCommit) {
  console.error('Usage: node scripts/publish-mini-app-to-fitness.mjs <sixpack|plan|skills> <source-commit>');
  process.exitCode = 2;
} else {
  console.log(`${app.label} ${sourceCommit.slice(0, 8)} remains in its source repo; no Fitness sync on a dev push.`);
  console.log(`To integrate it, merge the app repo's dev branch into fitness, then update the Fitness submodule ${app.path}.`);
}
