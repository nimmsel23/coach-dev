import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CLIENTS_ROOT = path.join(os.homedir(), "vital", "Klienten");

export function getClientInfo(clientId) {
  if (!clientId) return null;
  const clientDir = path.join(CLIENTS_ROOT, clientId);
  const clientJsonPath = path.join(clientDir, "client.json");
  
  if (!fs.existsSync(clientJsonPath)) return null;
  
  try {
    const info = JSON.parse(fs.readFileSync(clientJsonPath, "utf-8"));
    return {
      ...info,
      root: clientDir,
      envPath: path.join(clientDir, ".env")
    };
  } catch (e) {
    console.error(`Error reading client info for ${clientId}:`, e.message);
    return null;
  }
}

export function getAllClients() {
  if (!fs.existsSync(CLIENTS_ROOT)) return [];
  return fs.readdirSync(CLIENTS_ROOT, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith("_"))
    .map(dirent => getClientInfo(dirent.name))
    .filter(Boolean);
}

export function getAllClientUids() {
  const uids = new Set();
  for (const client of getAllClients()) {
    const primary = client?.firebase_uid;
    if (primary && primary !== "default") uids.add(primary);
    for (const uid of client?.firebase_uids || []) {
      if (uid && uid !== "default") uids.add(uid);
    }
  }
  return Array.from(uids).sort();
}

export function getUidForClient(clientId) {
  const info = getClientInfo(clientId);
  return info?.firebase_uid || "default";
}
