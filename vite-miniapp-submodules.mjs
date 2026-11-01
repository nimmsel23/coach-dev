// Gemeinsamer Vite-Resolver für Plan/6Pack/Skills als Submodule von fitness-app.
// src/views/{Plan,SixPack,Skills} sind nicht mehr eingecheckt; jeder Build, der
// fitness-app-Quellen kompiliert (fitness selbst, Shell, Habits, VOS Fitness …),
// bindet dieses Plugin ein: miniAppSubmodulePlugin(<Pfad zu fitness-app>).
import { dirname, isAbsolute, relative, resolve, sep } from 'path'
import { existsSync, statSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Mini-App implementations live in their own repositories. Fitness tracks
// the approved integration commit of each repo as a Git submodule; this
// resolver makes Fitness compile that checkout directly instead of a copied
// view under src/views. Missing files fall back to Fitness-owned adapters.
//
// Quelle je Mini-App, in dieser Reihenfolge: Nachbar-Checkout neben `root`
// (`../plan-dev` in ~/dev/fitness-dev, `../plan-app` im vitalos-Workspace), sonst der
// verschachtelte Submodul-Ordner unter `root` (bisheriger Weg).
function firstExisting(root, siblings, nested) {
  for (const name of siblings) {
    const dir = resolve(root, '..', name)
    if (existsSync(dir)) return dir
  }
  return resolve(root, nested)
}

export function miniAppSubmodulePlugin(root = __dirname) {
  const planRoot = firstExisting(root, ['plan-app', 'plan-dev'], 'plan')
  const sixpackRoot = firstExisting(root, ['6pack-app', '6pack-dev'], '6pack')
  const skillsRoot = firstExisting(root, ['skills-app', 'skills-dev'], 'Skills')

  const maps = [
    {
      local: resolve(root, 'src/views/Plan'),
      source: resolve(planRoot, 'src/views/Plan'),
    },
    {
      local: resolve(root, 'src/views/SixPack'),
      source: sixpackRoot,
    },
    {
      local: resolve(root, 'src/views/Skills'),
      source: skillsRoot,
    },
  ]

  return {
    name: 'fitness-miniapp-submodule-source',
    enforce: 'pre',
    // CSS-/Asset-Importe der Mini-Apps ohne feste Relativpfade: `@import "@vos-6pack/sixpack.css"`
    // (postcss-import löst sie über resolve.alias auf, resolveId-Hooks sehen sie nicht).
    config() {
      return {
        resolve: {
          alias: [
            { find: /^@vos-6pack\//, replacement: `${sixpackRoot}/` },
            { find: /^@vos-skills\//, replacement: `${skillsRoot}/` },
            { find: /^@vos-plan\//, replacement: `${planRoot}/` },
          ],
        },
      }
    },
    async resolveId(source, importer) {
      if (!importer || importer.startsWith('\0')) return null
      const request = source.split('?')[0]
      const importerPath = importer.split('?')[0]

      // Pakete der Mini-App-Quellen kommen aus dem node_modules von `root` (eine
      // Instanz von react, recharts, firebase …), nicht aus dem des Nachbar-Checkouts:
      // dort fehlen sie oder liegen doppelt vor.
      if (!request.startsWith('.') && !isAbsolute(request)) {
        if (
          !importerPath.includes(`${sep}node_modules${sep}`) &&
          [planRoot, sixpackRoot, skillsRoot].some((dir) => importerPath.startsWith(`${dir}${sep}`))
        ) {
          const hit = await this.resolve(source, resolve(root, 'package.json'), { skipSelf: true })
          if (hit) return hit
        }
        return null
      }

      const target = isAbsolute(request)
        ? request
        : resolve(dirname(importerPath), request)

      // Fitness generates this data from its own exercise KB before building;
      // 6Pack's standalone source keeps the same import contract.
      if (
        importerPath.startsWith(`${sixpackRoot}/`) &&
        request === './sixpackData.generated.js'
      ) {
        const fitnessData = resolve(root, 'src/views/SixPack/sixpackData.generated.js')
        if (existsSync(fitnessData)) return fitnessData
      }

      // Der Plan-Checkout bringt ein eigenes, abweichendes Fitness-Gerüst mit
      // (contexts, lib, components, hooks …). Importe daraus gehören zu den
      // Fitness-Gegenstücken, sonst entstehen zwei UserContext-Instanzen und der
      // Plan-Tab bricht ohne Provider ab.
      const planSrc = resolve(planRoot, 'src')
      const planViews = resolve(planSrc, 'views/Plan')
      if (importerPath.startsWith(`${planViews}${sep}`)) {
        const rel = relative(planSrc, target)
        if (rel && !rel.startsWith('..') && !isAbsolute(rel) && !(target === planViews || target.startsWith(`${planViews}${sep}`))) {
          const own = resolve(root, 'src', rel)
          for (const candidate of [own, `${own}.js`, `${own}.jsx`, `${own}/index.js`, `${own}/index.jsx`]) {
            if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
          }
        }
      }

      for (const map of maps) {
        const pathFromView = relative(map.local, target)
        if (pathFromView === '..' || pathFromView.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(pathFromView)) continue
        const submoduleFile = resolve(map.source, pathFromView)
        if (existsSync(submoduleFile)) return submoduleFile
      }
      return null
    },
  }
}
