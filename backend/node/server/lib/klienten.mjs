import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// client.json is the source of truth for a client's display name.
export function loadKlientenRegistry(readJson) {
  const dir = path.join(os.homedir(), "Klienten");
  const registry = {};
  if (!fs.existsSync(dir)) return registry;
  for (const slug of fs.readdirSync(dir)) {
    const cfgPath = path.join(dir, slug, "client.json");
    if (!fs.existsSync(cfgPath)) continue;
    const cfg = readJson(cfgPath);
    if (!cfg) continue;
    const uids = new Set(cfg.firebase_uids || []);
    if (cfg.firebase_uid) uids.add(cfg.firebase_uid);
    for (const uid of uids) {
      if (uid) registry[uid] = { name: cfg.name, slug };
    }
  }
  return registry;
}
