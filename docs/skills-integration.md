# Skills integration

`Skills/` is the Fitness submodule for `nimmsel23/skills-dev`, following its
`fitness` branch. Develop standalone Skills on `dev`; merge changes into
`fitness` when they are ready for the Fitness tab. Update the Fitness gitlink
to that commit to include it in the Fitness build.

Standalone Skills releases remain independent of the version used by Fitness.
Fitness CI checks out the nested submodule recursively, and a `Skills` gitlink
change triggers the Preview and Live workflows.
