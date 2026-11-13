# Prompt 1:
Read CLAUDE.md and docs/spec.md before anything else.

Don't write code yet. Give me a plan first and wait for my okay.

Goal for this session: a minimal Electron + React app that proves the
risky parts work. Nothing from the spec's four screens yet.

Scope:
- Electron window opens, React renders in it
- A SQLite database file is created in the per-user app data directory
  and a trivial query runs against it successfully
- The app reads one scene markdown file from disk, counts its words
  and paragraphs, and displays both
- The library root is read from config, with a hardcoded fallback for now

Out of scope: the schema, any of the four screens, any styling beyond
what's needed to see that it works.

Constraints:
- The native SQLite module must be rebuilt against Electron, not system
  Node. Set this up properly in the build config now.
- All paths through Node's path module.
- Ask before adding any dependency, and tell me what it's for.

When it runs, tell me the commands to start it in dev and to produce
installable builds for Linux and Windows.

# Prompt 2:
Read docs/spec.md again — the data model section is what this session
implements.

Don't write code yet. Plan first and wait for my okay.

Goal: the full schema from the spec, plus a migration runner.

Migrations:
- Numbered SQL files in a migrations/ directory (0001_initial.sql, etc.)
- A runner that checks SQLite's user_version pragma, applies any
  migrations newer than it, in order, and updates user_version
- Each migration runs in a transaction; a failure rolls back and stops
- Applying migrations on app start is fine, but the runner must also be
  callable on its own so I can run it without launching the app
- No migration library

Schema: works, chapters, scenes, beats exactly as the spec describes.
Include:
- Foreign keys with ON DELETE behaviour you think is right — tell me
  what you chose and why before writing it
- CHECK constraints on the three status fields, using the spec's values
- NOT NULL on everything the spec implies is required
- Indexes on the foreign keys and on anything the four screens will
  sort or filter by
- PRAGMA foreign_keys = ON wherever the connection is opened

Do not create: wordcount columns of any kind, a lookup table for beat
kinds or POV, or any table not in the spec.

When it's done, show me the resulting schema as SQLite reports it, and
tell me how to run the migration runner standalone.

# Prompt 3:
Read docs/spec.md again. This session creates test data and the queries
the four screens will need.

Don't write code yet. Plan first and wait for my okay.

Part 1 — the seeder

A dev-only script, not part of the app and not a migration.

Safety guard, build this first: the seeder refuses to run unless the
target library root contains a marker file named .ficbible-test-library.
If the marker is absent, it aborts with an explanatory error and writes
nothing. My real fic lives in a library with no marker, and the seeder
must be incapable of touching it.

The seeder should be re-runnable: wipe the test library's database rows
and generated files, then regenerate from scratch.

Generate:
- 2 works, with different numbers of chapters
- 3-5 chapters per work, mixed chapter statuses
- 2-6 scenes per chapter, mixed scene statuses, with real markdown files
  created on disk containing plausible-looking prose
- 3-8 beats per scene, mixed kinds and mixed statuses, some with a
  paragraph_ref set and some null

Include these edge cases deliberately:
- a scene whose file is empty
- a scene with no beats
- a chapter with exactly one scene
- a work with no chapters
- one scene file written with CRLF line endings
- repeated POV values and beat kinds across scenes, so the suggestion
  queries have something to deduplicate

The prose is placeholder content for testing. Keep it generic and
original — do not imitate any existing work.

Part 2 — the queries

Write the read queries each screen needs, as a data access layer:
- Navigation tree: works with their chapters with their scenes, enough
  for the sidebar including scene status
- Chapter overview: every scene in a chapter with position, title, POV,
  status, wordcount, and its beat counts broken down by status
- Scene detail: one scene with its beats in order
- Suggestions: distinct beat kinds and distinct POV values, with usage
  counts, most-used first

Important: wordcounts are not in the database. Any query that reports a
wordcount must get it from the filesystem, and the chapter and work
totals are sums of file-derived scene counts. Do not add a wordcount
column, and do not compute totals in SQL.

Finish by running the seeder against the test library and showing me the
output of each query.