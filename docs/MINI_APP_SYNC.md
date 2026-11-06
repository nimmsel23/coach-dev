# Mini-App-Integration in Fitness

`plan`, `6pack` und `Skills` sind Git-Submodule aus den eigenständigen
Repos `plan-dev`, `6pack-dev` und `skills-dev`. `.gitmodules` nennt für jedes
Submodul den Branch `fitness` als Integrationslinie. Der konkrete Commit steht,
wie bei jedem Submodul, im Gitlink des Fitness-Commits.

## Änderungsfluss

1. Mini-App-Änderungen entstehen auf dem jeweiligen `dev`-Branch. Dieser Stand
   kann unabhängig für die Mini-App weitergebaut und released werden.
2. Soll ein Stand in Fitness einfließen, wird er im Mini-App-Repo geprüft und
   nach dessen Branch `fitness` gemerged.
3. In `fitness-dev` wird das Submodul auf den gewünschten Commit von `fitness`
   aktualisiert. Der Gitlink wird zusammen mit eventuellen Fitness-Anpassungen
   committed und nach `fitness-dev/dev` gepusht.
4. Fitness-CI checkt alle Submodule rekursiv aus, baut die integrierte App und
   veröffentlicht die Preview. Für den späteren Release wird der Fitness-Stand
   wie bisher nach `vitalos` übernommen.

| Mini-App | Submodulpfad | Integrationsbranch |
| --- | --- | --- |
| Plan | `plan/` | `fitness` |
| 6Pack | `6pack/` | `fitness` |
| Skills | `Skills/` | `fitness` |

`vite.config.js` löst die integrierten View-Imports gegen die jeweiligen
Submodule auf. Der Fitness-Build benötigt daher initialisierte Submodule:

```sh
git submodule update --init --recursive
```

Preview- und Live-Workflows müssen auf Änderungen an den Gitlink-Pfaden und an
`.gitmodules` reagieren. Das lokale `deploy.sh` gehört nicht zu diesem Ablauf.

Zuerst wird der freigegebene Stand im Mini-App-Repo übernommen und gepusht:

```sh
cd ~/plan-dev
git switch fitness
git pull --ff-only origin fitness
git merge dev
git push origin fitness
```

Dann wird der Submodul-Pointer in Fitness aktualisiert:

```sh
cd ~/fitness-dev
git submodule update --remote plan
pnpm run build:firebase
git add plan
git commit -m "chore(fitness): update Plan integration"
git push origin dev
```
