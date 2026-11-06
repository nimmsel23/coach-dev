#!/usr/bin/env node
import { createRoutineStore } from "../server/domain/routines.mjs";

const [command, ...args] = process.argv.slice(2);
const root = process.env.FITNESS_JS_ROUTINES_DATA_DIR;
const uid = process.env.FITNESS_JS_UID;
if (!root || !uid) {
  console.error("Set FITNESS_JS_ROUTINES_DATA_DIR (absolute, isolated path) and FITNESS_JS_UID.");
  process.exit(2);
}
const store = createRoutineStore(root);
try {
  let result;
  switch (command) {
    case "list": result = await store.list(uid); break;
    case "show": result = await store.get(uid, args[0]); break;
    case "create": result = { id: await store.create(uid, { name: args.join(" ") }) }; break;
    case "rename": await store.patch(uid, args[0], { name: args.slice(1).join(" ") }); result = { ok: true }; break;
    case "delete": await store.remove(uid, args[0]); result = { ok: true }; break;
    default:
      console.error("Usage: fitness-routines.mjs list|show ID|create NAME|rename ID NAME|delete ID");
      process.exit(2);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
