-- Initial schema: works -> chapters -> scenes -> beats (docs/spec.md, Data model).
--
-- No prose and no wordcounts live here: files own the words, these tables
-- own everything about them. beats.kind and scenes.pov are free text with
-- no lookup table; suggestions come from SELECT DISTINCT.
--
-- ON DELETE CASCADE down the whole chain: a child row means nothing
-- without its parent, and deleting rows never touches files on disk.
--
-- folder and filename hold a single path segment each (the full path is
-- assembled at runtime), so separators and '.'/'..' are rejected.

CREATE TABLE works (
  id     INTEGER PRIMARY KEY,
  title  TEXT NOT NULL,
  folder TEXT NOT NULL UNIQUE
         CHECK (folder NOT IN ('', '.', '..')
                AND instr(folder, '/') = 0 AND instr(folder, '\') = 0)
) STRICT;

CREATE TABLE chapters (
  id          INTEGER PRIMARY KEY,
  work_id     INTEGER NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  number      INTEGER NOT NULL CHECK (number >= 1),
  title       TEXT NOT NULL,
  folder      TEXT NOT NULL
              CHECK (folder NOT IN ('', '.', '..')
                     AND instr(folder, '/') = 0 AND instr(folder, '\') = 0),
  status      TEXT NOT NULL DEFAULT 'drafting'
              CHECK (status IN ('drafting', 'ready to post', 'posted')),
  posted_date TEXT,  -- ISO 8601 date, null until posted
  posted_url  TEXT,  -- AO3 link, null until posted
  UNIQUE (work_id, number),
  UNIQUE (work_id, folder)
) STRICT;

CREATE TABLE scenes (
  id         INTEGER PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES chapters (id) ON DELETE CASCADE,
  position   INTEGER NOT NULL CHECK (position >= 1),
  title      TEXT NOT NULL,
  filename   TEXT NOT NULL
             CHECK (filename NOT IN ('', '.', '..')
                    AND instr(filename, '/') = 0 AND instr(filename, '\') = 0),
  pov        TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'outlined'
             CHECK (status IN ('outlined', 'drafting', 'drafted', 'revised')),
  UNIQUE (chapter_id, position),
  -- Case-insensitive so two names that collide on Windows can't coexist.
  UNIQUE (chapter_id, filename COLLATE NOCASE)
) STRICT;

CREATE TABLE beats (
  id            INTEGER PRIMARY KEY,
  scene_id      INTEGER NOT NULL REFERENCES scenes (id) ON DELETE CASCADE,
  position      INTEGER NOT NULL CHECK (position >= 1),
  kind          TEXT NOT NULL,
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned', 'in draft', 'cut')),
  paragraph_ref INTEGER CHECK (paragraph_ref >= 1),  -- 1-based, null if unanchored
  UNIQUE (scene_id, position)
) STRICT;

-- The UNIQUE constraints above lead with each foreign key, so they also
-- serve FK lookups, cascades and the screens' ordering. These two serve
-- the DISTINCT suggestion queries.
CREATE INDEX scenes_pov ON scenes (pov);
CREATE INDEX beats_kind ON beats (kind);
