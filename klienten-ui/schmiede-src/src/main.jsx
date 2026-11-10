import React from "react";
import { createRoot } from "react-dom/client";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./clients.css";
import { ClientForgeApp } from "./ClientForgeApp.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ClientForgeApp />
  </React.StrictMode>
);

const hostedByCoach = document.querySelector('base[href="/_klienten/"]') !== null;
if ("serviceWorker" in navigator && !hostedByCoach) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      window.__swRegistration = reg;
      const notify = () => window.dispatchEvent(new CustomEvent("sw-update-available"));
      if (reg.waiting) notify();
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) notify();
        });
      });
    }).catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading || !window.__swApplyRequested) return;
      reloading = true;
      window.location.reload();
    });
  });
}

if ("serviceWorker" in navigator && hostedByCoach) {
  navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
    registrations.filter((registration) => {
      const worker = registration.active || registration.waiting || registration.installing;
      return worker && new URL(worker.scriptURL).pathname === '/sw.js';
    }).map((registration) => registration.unregister())
  )).catch(() => {});
}
