# Hot: Vitaltrainer-Vault → Anatomie-Corpus für Agents/KB

Stand 2026-11-10. Potential — noch kein Build-Pfad.

## Fundlage

- Vault/Repo: `nimmsel23/Vitaltrainer` · lokal `~/Dokumente/Vitaltrainer` (`~/Vitaltrainer`)
- Schon auf Git (Auszug): ~66 `Sportkompetenz/Myologie/**`, ~72 `00Anatomie_MOCs/**`, ~257 anatomie-relevante `Sportkompetenz/**/*.md`
- Form: Obsidian-Prosa (Frontmatter, `[[wikilinks]]`, Ursprung/Ansatz/Innervation, Gottlob/Weineck/Tittel-MOCs)
- Gegenstück KB `nimmsel23/fitness`: strukturierte `muscles/**/*.yml` (App-IDs, viz, kurze Felder) + `anatomy_teaching/*.yaml` (übungszentriert)

→ Kein „noch reincommitten“ nötig für den Kern; eher **verknüpfen und kuratieren**.

## Rollen (nicht vermischen)

| Corpus | Owner | Nutzen |
|--------|-------|--------|
| Vitaltrainer Vault | Ausbildung / Obsidian | Narrative, MOCs, Tiefe für Agents & Lehre |
| `fitness` muscles/exercises YAML | App-SOT | IDs, Resolver, Build, Offline |
| Coach Laptop-Gate | Approve | Was in Expert-YAML landet |

Gleicher Schnitt wie Inbox: **GitHub/Agents lesen Vault**; **Coach approved** was in die KB wandert. Kein Dump Obsidian → `exercises/`.

## Sinnvolle Einbindung (Stufen)

1. **Agent-Corpus (schnell)**  
   In `fitness/llms.txt` / Agent-Prompts: optionaler Kontextpfad  
   `https://github.com/nimmsel23/Vitaltrainer` → `Sportkompetenz/Myologie`, `00Anatomie_MOCs`.  
   Enrichment/Teaching darf daraus zitieren; schreibt nur nach `inbox/` oder Review-Notes.

2. **Alias-Brücke**  
   Map Vault-Titel (`M. rectus abdominis`) → KB-ID (`501_rectus_abdominis`).  
   Datei z. B. `fitness/registry/vault_muscle_map.yml` (einmalig, pflegbar).

3. **Promote (selten, bewusst)**  
   Aus Vault-Abschnitten Felder in `muscles/*.yml` nachziehen (origin/insertion/innervation), wenn KB dünn ist — per PR/Inbox-ähnlichem Review, nicht Batch-Overwrite.

4. **Nicht tun**  
   - Vault als Runtime-Dependency der Apps  
   - Wikilinks 1:1 als App-Schema  
   - Coach-UI an Vitaltrainer.git koppeln

## Nächster konkreter Schritt (wenn +go)

- [ ] Kurz inventarisieren: welche Myologie-Notes haben kein KB-Pendant (Coverage-Diff).
- [ ] `vault_muscle_map.yml` Skelett für Top-30 Muskeln.
- [ ] Ein Satz in `fitness/llms.txt` + `INBOX.md`/AGENTS: Vitaltrainer = optionaler Anatomie-Corpus für Agents.
