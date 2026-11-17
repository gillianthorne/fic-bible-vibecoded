-- Characters (docs/spec.md, Data model; screen 7, Character profile).
--
-- A work has characters; a character has fields. Name, age and birthday
-- are columns because every character has them. Everything else the
-- author tracks ("Team", "Tims order") is a label-and-value row in
-- character_fields, so a new kind of field never needs a schema change.
--
-- age and birthday are free text: "17", "early thirties", "14 March".
--
-- A character's freeform notes live in a markdown file in the work's
-- characters folder, never in a column. filename is that file's name
-- only, unique within the work ignoring case, as Windows sees it.

CREATE TABLE characters (
  id       INTEGER PRIMARY KEY,
  work_id  INTEGER NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  name     TEXT NOT NULL CHECK (trim(name) <> ''),
  age      TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL
           CHECK (filename NOT IN ('', '.', '..')
                  AND instr(filename, '/') = 0 AND instr(filename, '\') = 0),
  UNIQUE (work_id, filename COLLATE NOCASE)
) STRICT;

CREATE TABLE character_fields (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  position     INTEGER NOT NULL CHECK (position >= 1),
  label        TEXT NOT NULL CHECK (trim(label) <> ''),
  value        TEXT NOT NULL DEFAULT '',
  UNIQUE (character_id, position)
) STRICT;

CREATE INDEX characters_work ON characters (work_id);
CREATE INDEX character_fields_label ON character_fields (label);
