# NEXT (coach-dev)

- [ ] Den neuen `Pages Docs`-Actions-Workflow bis zu einem erfolgreichen öffentlichen Pages-Deploy verifizieren.


-   **Review-Karte (Inbox-UI)**: Entscheidungsoberflaeche statt 40-Felder-Editor —
    Identitaet, 2-Satz-Was, Muskeln (primae), 3 Coaching-Highlights, Herkunft als ein
    Text + Freigeben/Loeschen/Verbessern. Braucht: Frontend-Serve-Umstellung (Katalog-
    UI aus Coach-Dist statt Fitness-Dist auf 8100-Staging) und User-Feedback zur
    konkreten Kartenform.
-   **fitness-dev-KB-Kopie**: traegt weiter eine divergente KB-Kopie (nur noch
    Konsument). Beim naechsten Upstream-Merge Katalog-Drift beachten; Ausmisten der
    Kopie als separater Schnitt, sobald sicher keine Pipeline mehr dort liest.
-   **Deploy-Formalisierung**: ~/.aos/fitness/kb-Seed geschah manuell (rsync);
    deploy.sh-Seed-Pfad auf coach-dev umstellen waere der formale Schritt.
-   **Systemd-Quelle**: coach-sync.service wird noch aus
    fitness/coach/deploy/coach-sync.service installiert (jetzt Coach-Stand im
    Coach-Baum); Pfad in der Unit-DokuSnapshots aktuell.


## Gemini CI-Agent follow-up

- [ ] Observe one genuine code-related red Coach CI run through repair and a green rerun. Production remains a manual release decision.
