export function randomId(prefix = "") {
  const ts = Date.now().toString(36).slice(-6);
  const rnd = Math.random().toString(36).slice(2, 8);
  const id = `${ts}${rnd}`;
  return prefix ? `${prefix}_${id}` : id;
}

const UMLAUT_MAP = {
  ä: "ae", ö: "oe", ü: "ue", ß: "ss",
};

function transliterateGerman(value) {
  return String(value).replace(/[äöüß]/g, (ch) => UMLAUT_MAP[ch]);
}

export function slugifyId(value, prefix = "") {
  const slug = transliterateGerman(String(value).toLowerCase())
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 50);
  return prefix ? `${prefix}_${slug}` : slug;
}
