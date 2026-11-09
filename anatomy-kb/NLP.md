# NLP & NLI: Die Brücke zwischen Tippen und Tun

Kurzform: Hör auf, Flags zu lernen. Bring dem Terminal bei, dich zu verstehen.

### Das Prinzip
Du hast Daten (Muskeln, Übungen, Tasks). Bisher musstest du exakt den Key (`latissimus_dorsi`) kennen. Mit diesem AUR-Stack baust du einen **Mapper**:

1.  **Input:** *"Was bringt Klimmzug?"*
2.  **Mapping:**
    - *"Klimmzug"* → `pull_up`
    - *"Was bringt"* → `anatomy teach`
3.  **Result:** System führt `anatomy teach pull_up` aus.

### Die Werkzeuge (ohne Marketing-Sprech)
*   **Vektoren (`thinc`, `blis`, `torchtext`):** Verwandeln Wörter in Zahlen. "Bizeps" und "Armbeuger" landen an der fast gleichen Stelle im Zahlenraum. Das System "weiß", dass sie dasselbe meinen.
*   **Parser (`spacy`):** Erkennt, wer was mit wem macht. Wer ist das Subjekt? Was ist die Aktion?
*   **Speed (`murmurhash`, `preshed`):** Sorgt dafür, dass das "Verstehen" nicht länger dauert als das Tippen.

### Anwendung in deinen Tools
Schalt ein einfaches `nlp.py` vor deine bestehenden Skripte. Es nimmt den Freitext, fischt die IDs raus und wirft sie deinen Funktionen vor die Füße. Fertig.
