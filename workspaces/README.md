# C-Suite workspaces (Git-Brain)

Rollen-Gehirne für die Coach-only Delivery-/Business-Werkstatt. State (Chats,
Freigaben) lebt in localStorage bzw. später Firestore `csuite/{role}/…`.

| Ordner | Rolle | Dashboard |
|--------|-------|-----------|
| `coo/` | Coaching-Delivery & Kundenerfolg | `/coach/coo` → dashboard |
| `cmo/` | Marketing, Leads, Markenstimme | `/coach/cmo` |
| `cso/` | Sales, Calls, Abschluss | `/coach/cso` |
| `cpo/` | Angebot & Coach-Produkt | `/coach/cpo` |
| `cto/` | Coach-Werkstatt, Architektur, CI | `/coach/cto` |
| `cfo/` | Umsatz, Posten, Belege | `/coach/cfo` |
| `_shared/` | Firebase HITL-Runtime (ESM) | `/coach/workspaces/_shared/runtime.js` |

Pro Rolle: `config.json`, `system-prompt.md`, `skills.json`, `knowledge/`,
`dashboard.html` (Vanilla, Dark Cockpit, HITL, LLM-Switcher, Mock bis Bridge).

**Brain-Laden:** Dashboard liest `./system-prompt.md` und `./skills.json` per
`fetch` (Git = SOT, kein Firestore-Sync fürs Gehirn).

**CEO-Portal:** `/coach/ceo` — Firebase Auth, iframe-Tabs auf alle Rollen.

Hub: `/coach/`. Bridge: `POST /api/csuite/run` (Loopback). Static: `/workspaces/`.
