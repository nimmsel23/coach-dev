// Same-origin Coach routing: keep share/reload URLs aligned with the embedded app.
export function syncFrameRoute(frame, host, onRoute) {
  let child;
  const fromChild = () => {
    try {
      const hash = child.location.hash;
      if (host.location.hash !== hash) {
        host.history.replaceState(null, '', `${host.location.pathname}${host.location.search}${hash}`);
      }
      onRoute(hash);
    } catch { /* An external page inside the frame cannot control the Coach URL. */ }
  };
  const fromHost = () => {
    const hash = host.location.hash;
    onRoute(hash);
    try {
      if (child && child.location.hash !== hash) child.location.replace(`${child.location.pathname}${child.location.search}${hash}`);
    } catch { /* Only the same-origin Coach document participates. */ }
  };
  const onLoad = () => {
    try { child?.removeEventListener('hashchange', fromChild); } catch { /* external document */ }
    child = frame.contentWindow;
    try {
      child.addEventListener('hashchange', fromChild);
      if (host.location.hash) fromHost();
      else fromChild();
    } catch { /* Cross-origin frames are not a routing source. */ }
  };
  frame.addEventListener('load', onLoad);
  host.addEventListener('hashchange', fromHost);
  return () => {
    frame.removeEventListener('load', onLoad);
    host.removeEventListener('hashchange', fromHost);
    try { child?.removeEventListener('hashchange', fromChild); } catch { /* external document */ }
  };
}
