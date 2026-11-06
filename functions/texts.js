// Meldungstexte aus notifications.yaml — eine Stelle zum Laden und Einsetzen.
// Änderungen an der YAML wirken erst nach `firebase deploy --only functions`.
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const NOTIFICATIONS = yaml.load(fs.readFileSync(path.join(__dirname, "notifications.yaml"), "utf8"));

function renderTemplate(str, vars = {}) {
  return String(str || "").replace(/\{(\w+)\}/g, (_, key) => (vars[key] != null ? vars[key] : `{${key}}`));
}

module.exports = { NOTIFICATIONS, renderTemplate };
