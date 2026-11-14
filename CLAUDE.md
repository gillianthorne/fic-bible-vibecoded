# Fic Bible

A local Electron + React desktop app for tracking the structure of
fanfiction: works → chapters → scenes → beats. Prose lives in markdown
files; structure lives in SQLite. Runs on Linux and Windows.

Full design spec: `docs/spec.md`. Read it before making design decisions.

## Hard rules

- No field lives in both stores. Files own the prose; SQLite owns
  everything about the prose. Never store scene text in a column.
- Wordcounts are computed at read time, never stored.
- Never write to a file that has content, except saving a scene from
  the prose editor, under the guards in `docs/spec.md` (File handling):
  refuse if the file changed on disk since it was opened, write a temp
  file then rename it over, keep line endings and BOM. Otherwise,
  creating an empty scene file, or an empty folder for a new work or
  chapter, are the only permitted writes.
- All paths go through Node's `path` module. No hardcoded separators.
- No network requests, ever.
- Scene files are addressed by scene + paragraph number, never line number.

## Scope

v1 is the six screens in the spec. Do not add search, settings UI,
or themes — those are explicitly deferred. v2 adds the prose editor
(spec screen 4a).

## Working style

- Ask before introducing a dependency.
- Ask before changing anything in `docs/spec.md`; the spec is the
  author's design, not yours to revise.
- Small commits, one concern each.