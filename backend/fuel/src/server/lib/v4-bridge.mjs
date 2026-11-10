const V4_TARGET = process.env.FUEL_V4_URL || "http://127.0.0.1:4000";

export async function callV4(path, { method = "GET", body } = {}) {
  const res = await fetch(`${V4_TARGET}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: ["GET", "HEAD"].includes(method) ? undefined : JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { ok: res.ok, status: res.status, data };
}
