export const PORT = Number(process.env.PORT || 9000);
export const HOST = process.env.HOST || "127.0.0.1";
export const VITE_ORIGIN = process.env.FUEL_VITE_ORIGIN || "";
export const DEV_VITE_PREFIXES = ["/@vite", "/src/", "/node_modules/", "/vite.svg"];

export const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"],
  [".woff", "font/woff"],
]);

export const WGER_API_URL = "http://127.0.0.1:8000/api/v2";
export const WGER_API_TOKEN = process.env.WGER_API_TOKEN || "92d9ea44fc0ac065e336e9ec443a196c40c68afe";
export const WGER_MIN_RESULTS = 3;

export const OFF_API_URL = "https://world.openfoodfacts.org/cgi/search.pl";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
