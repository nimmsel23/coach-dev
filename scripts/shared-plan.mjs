// Runtime loading also works when Vite bundles its ESM config.
import { createRequire } from 'node:module';
const loadModule = createRequire(import.meta.url);
export const { sharedPlanRoot } = loadModule('./shared-plan-root.cjs');
