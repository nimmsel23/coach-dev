# BACKEND.md — server.mjs Backend-Doku

Kontext: `../docs/CLAUDE.md` (Backend-Server-Rollen-Übersicht),
`../fitness/CLAUDE.md` (Python-Prod-Backend, Port 9150).

Aktueller Stand: API-Autodoc- und Zod-Validierungs-Schicht, eingebaut am
2026-08-31 und seit 2026-09-24 nach `server/routes/` aufgeteilt
(Node/Hono, Port 9100).

---

## Zwei Ebenen, bewusst unterschiedlich tief

`server.mjs` hat ~60 Routen. Alle von Hand mit vollen Request-/Response-
Schemas zu dokumentieren (kompletter Umbau auf `@hono/zod-openapi` für
jede einzelne Route) wäre ein großer, riskanter Eingriff in einen
produktiv laufenden Server ohne Test-Suite gewesen — deshalb ein
zweistufiger Ansatz.

### Ebene 1 — Basis-Autodoc (alle Routen)

`buildOpenApiSpec()` in `server.mjs` liest zur Laufzeit Honos eigene
Routing-Tabelle:

```js
for (const r of app.routes) { ... }
```

`app.routes` ist ein öffentliches Hono-API (`RouterRoute[]`, siehe
`node_modules/hono/dist/types/hono-base.d.ts`). Für jede Route wird
Pfad + Methode + Path-Parameter (`:id` → `{id}`) in ein minimales
OpenAPI-3.0-`paths`-Objekt übersetzt (Tag = erstes Pfad-Segment).

**Vorteil:** Kein Handschrift-Eintrag, der hinter dem Code zurückfallen
kann — jede neue/geänderte Route taucht automatisch in `/openapi.json`
auf, ohne dass irgendwer die Doku pflegen muss.

**Nachteil:** Keine Body-/Response-Schemas, nur "diese Route existiert
mit dieser Methode und diesen Pfad-Parametern".

### Ebene 2 — Zod-Schemas (jetzt praktisch alle API-Routen)

`app` ist `OpenAPIHono` (aus `@hono/zod-openapi`) statt `Hono` — ein
Drop-in-Ersatz, alle bestehenden `app.get(...)`/`app.post(...)`-Aufrufe
konnten schrittweise auf `app.openapi(createRoute({...}), handler)`
gehoben werden. Stand 2026-08-31 laufen jetzt praktisch alle echten
API-Routen in `server/routes/` über Zod; Plain-Hono geblieben sind nur die
Sonderfälle `GET /openapi.json`, `GET /docs` und der SPA-Fallback
`GET *`.

Typisches Muster:

```js
app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/export",
  tags: ["fitness"],
  summary: "Export erzeugen",
  jsonBody: looseObjectSchema,
}), async (c) => { ... });
```

Die benannten Kernrouten bleiben als explizite Einzel-Schemas bestehen:

| Route | Schema-Datei-Ort | Besonderheit |
|-------|-------------------|--------------|
| `GET /exercises/search` | `server/routes/exercises.mjs`, `exerciseSearchRoute` | `limit` via `z.coerce.number()` (Query-Params kommen immer als String an) |
| `GET /fitness/plan` | `server/routes/fitness-misc.mjs`, `fitnessPlanRoute` | Alle vier Query-Parameter optional mit `.default("")` |
| `POST /session` | `server/routes/session.mjs`, `sessionSaveRoute` | Body-Schema `.loose()` (siehe unten) |
| übrige JSON-Routen | `server/routes/*.mjs`, `defineJsonRoute()` aus `server/lib/routes.mjs` | gemeinsamer Helfer für Query-/Param-/Body-Schemas und Standard-Responses |

Diese Routen bekommen dadurch **echte Request-Validierung**, nicht nur
Doku: ein ungültiger Wert (z. B. `limit=abc`) führt jetzt zu `400` mit
einer strukturierten `ZodError`-Antwort, statt dass der Handler mit einem
stillschweigenden Fallback weiterläuft.

```
$ curl "http://127.0.0.1:9100/exercises/search?limit=abc"
400
```

---

## `POST /session`: bewusst lockeres Schema

Das Session-JSON-Format (siehe `../src/CLAUDE.md`, Abschnitt
"Session-JSON-Format") ist über Zeit gewachsen (`slots[]`, `rev`,
`snapshot_version`, ...) und wird von mehreren Schreibpfaden befüllt.
Ein striktes Zod-Schema hätte real genutzte, aber nicht vollständig
antizipierte Feld-Kombinationen zurückweisen können — das wäre ein reiner
Regressions-Risiko-Import ohne Gegenwert gewesen.

Deshalb:

```js
const sessionBodySchema = z.object({
  date: z.string().optional(),
  block: z.string().optional(),
  exercises: z.array(sessionExerciseSchema).optional(),
  slots: z.array(z.record(z.string(), z.any())).optional(),
  effort: z.union([z.string(), z.number()]).optional(),
  mood: z.string().optional(),
  notes: z.string().optional(),
}).loose().openapi("SessionBody");
```

- Fast jedes Feld `optional()` — kein Feld wird als Pflicht erzwungen,
  das der bisherige Code nicht ohnehin schon voraussetzte.
- `.loose()` (Zod-4-Nachfolger von `.passthrough()`) lässt unbekannte
  Zusatzfelder unverändert durch, statt sie stillschweigend zu entfernen
  oder die Validierung scheitern zu lassen.
- **Was das Schema trotzdem fängt:** ein kaputter/nicht-Objekt-Body
  (z. B. versehentlich ein reiner String oder Array als POST-Payload) —
  vorher landete das über `c.req.json().catch(() => ({}))` still als
  leere Session im Dateisystem, jetzt gibt es einen expliziten `400`.

Kurz: Malformed-Input-Schutz statt strenger Shape-Gate-Validierung.

---

## `/openapi.json`: Merge beider Ebenen

```js
app.get("/openapi.json", (c) => {
  const spec = buildOpenApiSpec();                                   // Ebene 1, alle Routen
  const zodDoc = app.getOpenAPIDocument({ openapi: "3.0.3", info: spec.info }); // Ebene 2, alle app.openapi()-Routen
  for (const [p, methods] of Object.entries(zodDoc.paths || {})) {
    spec.paths[p] = { ...spec.paths[p], ...methods };                // Zod-Eintrag überschreibt nur die eigene Methode
  }
  if (zodDoc.components) spec.components = zodDoc.components;
  return c.json(spec);
});
```

Wichtig: `GET /session` und `POST /session` liegen auf demselben Pfad —
der Merge überschreibt pro HTTP-Methode, nicht pro Pfad, daher bleiben
beide Methoden unabhängig dokumentiert.

---

## Weitere Routen auf dieses Muster heben

Um eine weitere Route mit Zod auszustatten:

1. `createRoute({ method, path, tags, summary, request: { query/body/params }, responses })` definieren.
2. Bestehenden `app.get(...)`/`app.post(...)`-Aufruf durch
   `app.openapi(<route>, handler)` ersetzen oder den gemeinsamen Helfer
   `defineJsonRoute()` verwenden.
3. Für Query-/Path-/Body-Validierung ein passendes Zod-Schema angeben.
   Der Handler kann danach weiter `c.req.query(...)`, `c.req.param(...)`
   oder `c.req.json()` nutzen; `c.req.valid(...)` ist optional, aber für
   neue strengere Handler meist lesbarer.
4. Bei Body-Schemas mit gewachsener/freier Struktur (wie Sessions oder
   Proxy-Payloads):
   `.loose()` statt striktem Schema erwägen, um reale Payloads nicht zu
   brechen.

Kein Änderungsbedarf an `buildOpenApiSpec()` oder dem `/openapi.json`-
Merge — beide funktionieren unabhängig von der Anzahl der Zod-Routen.

---

## Bekannte Lücke: Backend-Parität Node ↔ Python

Im Zuge der Autodoc-Arbeit wurde `/openapi.json` genutzt, um alle
Node-Routen gegen `fitness/api/routers/*.py` abzugleichen (Audit
2026-08-31). Ergebnis: von ~60 Routen hat **eine** keine
Python-Entsprechung — `GET/POST /fitness/coach/habit-cycle/:clientUid`
(Node liest/schreibt direkt `~/.aos/fitness/users/{uid}/habit-cycle.json`,
kein FastAPI-Router dafür). Alle anderen `proxyToPython`- und nativen
Node-Routen hatten ein verifiziertes 1:1-Pendant. Details + Kontext zur
laufenden "server.mjs → Frontend-only"-Migration: Claude-Memory
`project_server_mjs_frontend_only_migration`. Stand 2026-08-31: bewusst
noch nicht gefixt.
