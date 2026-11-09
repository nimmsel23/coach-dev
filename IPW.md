# IPW — coach-dev (perfekte Coach-App)

Ideal Parallel World der Coach-Betriebszentrale. Horizon: Schmiede, Gehirn und
Backdoor — ohne die Klienten-App zu werden.
Stand: 2026-11-09.

## Die eine Szene

Daniel sitzt am Laptop. Klient gewählt. Inbox zeigt eine Übung, die Aufmerksamkeit
braucht — ein Tap: freigeben oder schärfen. Plan-Modul offen: Zyklus schmieden,
Version publishen, zuweisen. Local-Backdoor läuft auf `:9150` wenn die Cloud
nervt. Handy des Klienten braucht davon nichts zu wissen.

## Dominion der App

- **Schmiede** — Programme und Pläne für *andere* Menschen; Zuweisung mit klarer
  Freigabe (Entwurf ≠ published).
- **Gehirn** — `coach catalog` + KB-Submodul (`~/dev/fitness`); Enrichment und
  Audit als Handwerk, nicht als PWA-Ballast.
- **Ein Prozess :9150** — Sessions, Workouts, Inbox, Sync — eine Tür.
- **Klienten führen** — Auswahl, Kommunikation, Praxis/Konsole wo nötig; UI
  irgendwann vollständig in Coach, nicht als Geschwister-Zwang.
- **Plan als Pin** — Editor aus plan-dev; Host liefert Identität und Persistenz.

## Was die perfekte App bewusst nicht ist

- Keine zweite Fitness-PWA.
- Kein Node-`~/dev/backend` als heimliches Coach-Zuhause.
- Keine parallelen Python-Kopien (`fitness-cli`, fitness-dev-Fork) am Leben.

## Spürbarer Alltag

Morgens: Inbox leer oder drei klare Decisions.  
Vormittags: einen Klientenplan schmieden und freigeben.  
Lokal: Backdoor testen ohne Firebase-Theater.  
KB: YAML im Submodul committen — ein Ort, ein Push, Gitlink nachziehen.

## Messlatte (IPW erreicht wenn…)

1. Jede Catalog-/API-Frage endet in `coach-dev` + `~/dev/fitness` — nirgendwo sonst.
2. Schmiede und Klienten-App teilen Plan-Pin ohne Code-Duplikat.
3. `:9150` ist die einzige Local-Wahrheit; tote Ports/Units existieren nicht.
4. Klienten-UI braucht kein separates Produkt-Repo mehr.
5. Ein AL kann Ownership in einer Seite erklären (`OWNERSHIP-MAP` = Realität).

## Vom FRAME hierher

Heute: API und Catalog leben, KB ist Submodul, Klienten-UI noch Sibling.  
IPW: eine Zentrale — schmieden, wissen, zuweisen — dünne Grenzen, null Kopien.
