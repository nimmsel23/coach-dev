import fs from "fs";
import path from "path";
import YAML from "yaml";
import { MIME_TYPES } from "../../shared/config/constants.mjs";
import { STATIC_DIR } from "../config/paths.mjs";

export function readJsonFile(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
  }
  return fallback;
}

export function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function readYamlFile(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return YAML.parse(content);
    }
  } catch (e) {
    console.error(`Error reading YAML ${filePath}:`, e.message);
  }
  return fallback;
}

export function writeYamlFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, YAML.stringify(data, { indent: 2 }), "utf-8");
}

export function getMimeType(pathname) {
  const ext = path.extname(pathname);
  return MIME_TYPES.get(ext) || "application/octet-stream";
}

export async function serveFile(filePath, reply) {
  if (!fs.existsSync(filePath)) {
    reply.code(404).send("Not Found");
    return;
  }

  const mimeType = getMimeType(filePath);
  const content = fs.readFileSync(filePath);
  reply.type(mimeType).send(content);
}

export function isPathInStatic(filePath) {
  return path.resolve(filePath).startsWith(path.resolve(STATIC_DIR));
}
