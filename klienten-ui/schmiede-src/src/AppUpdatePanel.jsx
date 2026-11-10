import { useEffect, useState } from "react";

export function AppUpdatePanel() {
  const [version, setVersion] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || document.querySelector('base[href="/_klienten/"]')) return;
    const sw = navigator.serviceWorker;
    const onMsg = (e) => { if (e.data?.type === "VERSION") setVersion(e.data.version); };
    sw.addEventListener("message", onMsg);
    if (sw.controller) sw.controller.postMessage({ type: "GET_VERSION" });
    const reg = window.__swRegistration;
    if (reg?.waiting) setUpdateReady(true);
    const onUpdate = () => setUpdateReady(true);
    window.addEventListener("sw-update-available", onUpdate);
    return () => {
      sw.removeEventListener("message", onMsg);
      window.removeEventListener("sw-update-available", onUpdate);
    };
  }, []);

  async function check() {
    setChecking(true);
    try {
      const reg = window.__swRegistration || await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.update();
      if (reg?.waiting) setUpdateReady(true);
    } catch {}
    setTimeout(() => setChecking(false), 600);
  }

  function apply() {
    const reg = window.__swRegistration;
    if (reg?.waiting) { window.__swApplyRequested = true; reg.waiting.postMessage({ type: "SKIP_WAITING" }); }
    else window.location.reload();
  }

  if (document.querySelector('base[href="/_klienten/"]')) return null;

  return (
    <div className="app-update-panel">
      <div className="app-update-row">
        <span>Version</span>
        <code>{version || "—"}</code>
      </div>
      {updateReady ? (
        <button type="button" className="app-update-btn primary" onClick={apply}>
          Update laden
        </button>
      ) : (
        <button type="button" className="app-update-btn" onClick={check} disabled={checking}>
          {checking ? "Suche…" : "Auf Update prüfen"}
        </button>
      )}
    </div>
  );
}
