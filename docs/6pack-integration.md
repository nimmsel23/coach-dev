# 6Pack integration

`6pack/` is the Fitness submodule for `nimmsel23/6pack-dev`, following its
`fitness` branch. Develop the standalone app on `dev`; merge changes into
`fitness` when they are ready for the Fitness tab. Update the Fitness gitlink
to that commit to include it in the Fitness build.

The standalone 6Pack release remains independent. `fitness/catalog/kb` remains
the source of truth for Fitness exercise data; `pnpm run build:sixpack-data`
generates the Fitness-specific exercise data used by its integrated view.

Fitness CI checks out the nested submodule recursively. A `6pack` gitlink
change triggers both the Preview and Live workflows.
