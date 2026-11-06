import {
  categoryDe, equipmentDe, forceDe, levelDe, mechanicDe, muscleDe,
  LEVEL_ORDER, norm,
} from './labels.js'

// Facetten des Atlas. `get` liefert die normalisierten Werte eines Eintrags,
// `label` die deutsche Anzeige. Reihenfolge = Reihenfolge im Filter-Panel.
export const FACETS = [
  { key: 'muscle', title: 'Muskel', label: muscleDe,
    get: (ex, ctx) => (ctx.withSecondary ? [...ex.primary, ...ex.secondary] : ex.primary).map(norm) },
  { key: 'category', title: 'Kategorie', label: categoryDe, get: (ex) => [norm(ex.category)] },
  { key: 'equipment', title: 'Equipment', label: equipmentDe, get: (ex) => [norm(ex.equipment)] },
  { key: 'level', title: 'Level', label: levelDe, get: (ex) => [norm(ex.level)],
    order: LEVEL_ORDER },
  { key: 'force', title: 'Bewegung', label: forceDe, get: (ex) => [norm(ex.force)] },
  { key: 'mechanic', title: 'Typ', label: mechanicDe, get: (ex) => [norm(ex.mechanic)] },
]

function searchHaystack(ex) {
  const parts = [
    ex.name, ex.catalog?.display_name, ex.catalog?.german,
    categoryDe(ex.category), equipmentDe(ex.equipment),
    ...ex.primary.map(muscleDe), ...ex.primary,
    ...ex.secondary.map(muscleDe),
  ]
  return parts.filter(Boolean).map((p) => norm(p).replace(/[äöü]/g, (c) => ({ ä: 'a', ö: 'o', ü: 'u' }[c]))).join(' ')
}

const hayCache = new WeakMap()
function hay(ex) {
  let h = hayCache.get(ex)
  if (!h) { h = searchHaystack(ex); hayCache.set(ex, h) }
  return h
}

function fold(s) {
  return norm(s).replace(/[äöü]/g, (c) => ({ ä: 'a', ö: 'o', ü: 'u' }[c]))
}

// skipKey: Facette, die beim Zählen ausgelassen wird (disjunktive Zähler —
// die Zahl an einem Chip zeigt, was nach Anklicken übrig bliebe).
export function filterItems(items, ctx, skipKey = null) {
  const tokens = fold(ctx.q).split(' ').filter(Boolean)
  return items.filter((ex) => {
    if (ctx.onlyCatalog && !ex.catalog) return false
    if (ctx.source && ex.source !== ctx.source) return false
    if (tokens.length) {
      const h = hay(ex)
      if (!tokens.every((t) => h.includes(t))) return false
    }
    for (const facet of FACETS) {
      if (facet.key === skipKey) continue
      const selected = ctx.sel[facet.key]
      if (!selected || selected.size === 0) continue
      const values = facet.get(ex, ctx)
      if (!values.some((v) => selected.has(v))) return false
    }
    return true
  })
}

export function facetCounts(items, ctx, facet) {
  const counts = new Map()
  for (const ex of filterItems(items, ctx, facet.key)) {
    for (const v of new Set(facet.get(ex, ctx))) {
      if (!v) continue
      counts.set(v, (counts.get(v) || 0) + 1)
    }
  }
  // Ausgewählte Werte bleiben sichtbar, auch bei Zähler 0.
  for (const v of ctx.sel[facet.key] || []) if (!counts.has(v)) counts.set(v, 0)
  const entries = [...counts.entries()]
  if (facet.order) {
    entries.sort((a, b) => facet.order.indexOf(a[0]) - facet.order.indexOf(b[0]))
  } else {
    entries.sort((a, b) => b[1] - a[1] || facet.label(a[0]).localeCompare(facet.label(b[0]), 'de'))
  }
  return entries
}

const SORTERS = {
  az: (a, b) => a.name.localeCompare(b.name, 'en'),
  level: (a, b) => LEVEL_ORDER.indexOf(norm(a.level)) - LEVEL_ORDER.indexOf(norm(b.level)) || a.name.localeCompare(b.name, 'en'),
  muscle: (a, b) => muscleDe(a.primary[0]).localeCompare(muscleDe(b.primary[0]), 'de') || a.name.localeCompare(b.name, 'en'),
}

export function sortItems(items, mode) {
  return [...items].sort(SORTERS[mode] || SORTERS.az)
}
