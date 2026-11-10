export function isISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function todayISO() {
  return formatLocalDate(new Date());
}

// Mittag, damit Sommerzeit und toISOString die Kalendertage nicht verschieben.
export function parseLocalNoon(iso) {
  if (!isISODate(iso)) return new Date(NaN);
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function shiftLocalISO(iso, days) {
  const date = parseLocalNoon(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

// count Tage, ältester zuerst, letzter Eintrag ist anchorISO.
export function datesEndingAt(anchorISO, count) {
  const dates = [];
  for (let i = count - 1; i >= 0; i -= 1) dates.push(shiftLocalISO(anchorISO, -i));
  return dates;
}

export function sanitizeMetric(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.round(num * 10) / 10) : 0;
}

export function normalizeRoutedPath(pathname, req) {
  let path = pathname;

  // Strip /c/<clientId>/ prefix (client-based routing)
  const clientMatch = path.match(/^\/c\/([^/]+)\/(.*)$/);
  if (clientMatch) {
    req.clientId = clientMatch[1];
    path = "/" + clientMatch[2];
  }

  // Strip other prefixes (backwards compat)
  const prefixMatch = path.match(/^\/[a-z0-9-]+\/(.+)$/);
  if (prefixMatch && !path.startsWith("/v2") && !path.startsWith("/nutrition") &&
      !path.startsWith("/supplements") && !path.startsWith("/fuel")) {
    path = "/" + prefixMatch[1];
  }

  return path;
}
