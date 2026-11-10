// One transparent transport for all APIs: Python owns paths, auth and bodies.
export function createPythonProxy(pythonBase) {
  return async function proxyToPython(c, pythonPath) {
    const source = new URL(c.req.url);
    const headers = new Headers(c.req.raw.headers);
    for (const name of ['host', 'connection', 'content-length', 'transfer-encoding']) headers.delete(name);
    try {
      const res = await fetch(`${pythonBase}${pythonPath}${source.search}`, {
        method: c.req.method, headers,
        body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
        duplex: 'half', redirect: 'manual', signal: c.req.raw.signal,
      });
      const outgoing = new Headers(res.headers);
      for (const name of ['connection', 'transfer-encoding', 'content-length', 'content-encoding']) outgoing.delete(name);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outgoing });
    } catch (err) {
      return c.json({ ok: false, error: 'fitness_api_unreachable' }, 502);
    }
  };
}

export function registerPythonApi(app, pythonBase) {
  const proxy = createPythonProxy(pythonBase);
  app.all('/api/*', (c) => proxy(c, c.req.path));
}
