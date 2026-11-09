# Architektur — Backend-Breakthrough (2026-11-09)

Siehe ausführlich `docs/ARCHITECTURE.md` (Abschnitt Backend-Breakthrough).

Kurz: KB-Daten `~/dev/fitness` · Python/API `coach-dev` · Plan-Brücke `plan-dev` ·
Klient `fitness-dev` · Node `~/dev/backend`. Plan ohne Local-Backend; Coach
hostet Schmiede + `:9150`.

---

# fitness-dev Architektur

Dieses Dokument beschreibt die einfache und klare Architektur der Fitness-App. Der Stack verzichtet auf komplexe, serverseitige Python-Backends oder AlphaOS-Integrationen für das Frontend. 

Stattdessen teilt sich die Architektur in zwei klare Modi:

## 1. Frontend
Das Frontend ist eine mit **Vite** und **React** gebaute Single Page Application (SPA).
Der gesamte Datenfluss wird dynamisch über den Alias `@db` in der `vite.config.js` gesteuert. Je nach Build-Modus wird dieser Alias unterschiedlich aufgelöst.

## 2. Datenfluss & Modi

### Local Dev Mode (`npm run dev`)
- **Datenfluss-Steuerung:** Der `@db`-Alias zeigt auf `src/lib/db/index.js`.
- **Lokales Backend:** Fetch-Requests des Frontends gehen an den Vite-Proxy (Port `5902`), der sie an `http://localhost:9100` weiterleitet. 
- **`server.mjs`:** Auf diesem Port läuft ein einfaches Hono-basiertes Node.js-Backend (`server.mjs`). Es schreibt Sessions als lokale FS-JSON (Source of Truth) und benachrichtigt danach das Python-Backend (`fitness-api.service` :9150), das als einziger Schreiber die SQLite-Historie (`training_history.sqlite`) per Upsert aktualisiert — Details: `docs/ARCHITECTURE.md` ("Session-Storage: Schichten & Konfliktmodell"). `server.mjs` dient ansonsten weiter **rein als lokales Mock-/Dev-Backend**.

### Firebase Mode (`npm run build:firebase` / Produktion)
- **Datenfluss-Steuerung:** Der `@db`-Alias zeigt auf `src/lib/db/index.firestore.js`.
- **Direkter Zugriff:** Das kompilierte Frontend spricht **DIREKT** mit Cloud Firestore über das Firebase SDK.
- **Kein Backend:** `server.mjs` (oder jegliches andere Backend) wird in diesem Modus überhaupt nicht genutzt. Die App ist komplett Serverless und greift vom Client direkt auf die Firebase-Ressourcen zu.
