# Coaching-Delivery Scope

Dieses Workspace-Wissen gilt nur für 1:1- und Kleingruppen-Coaching in Coach.

## Prozess

1. **Vorbereitung** — Plan/Heute, letzte Notizen, Blockaden.
2. **Session** — Cues, Übungen, Feedback live.
3. **Nachbereitung** — Zusammenfassung, Hausaufgaben, Follow-up-Entwurf.
4. **Check-in** — Erinnerung wenn Stille zu lange dauert.

## Datenquellen (Lesen)

- Lokale Klientenregistry via Coach-API `:9150` (`/api/clients`, `/api/client/<id>/…`).
- Cloud-Feedback (Workouts, Messages) bleibt parallel in der Coach-SPA; dieses
  Cockpit liest zuerst die lokalen Delivery-Pfade.

## HITL

Alles mit `requiresApproval` landet als `pending_approval` und wartet auf Daniel.
