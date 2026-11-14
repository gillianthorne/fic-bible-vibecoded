-- Fandoms and ships (docs/spec.md, Data model).
--
-- A work has one fandom and one ship or none (gen), so this stays
-- one-to-many: works point at a fandom and a ship, and a ship belongs to a
-- fandom. Both are nullable on works, since an imported work has neither
-- until it's set. That a work's ship is in the work's own fandom is
-- checked in edit.js.
--
-- Names are unique case-insensitively, so "Good Omens" and "good omens"
-- can't both exist. Deleting a fandom or ship leaves its works with none.

CREATE TABLE fandoms (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  UNIQUE (name COLLATE NOCASE)
) STRICT;

CREATE TABLE ships (
  id        INTEGER PRIMARY KEY,
  fandom_id INTEGER NOT NULL REFERENCES fandoms (id) ON DELETE CASCADE,
  name      TEXT NOT NULL CHECK (trim(name) <> ''),
  UNIQUE (fandom_id, name COLLATE NOCASE)
) STRICT;

ALTER TABLE works ADD COLUMN fandom_id INTEGER REFERENCES fandoms (id) ON DELETE SET NULL;
ALTER TABLE works ADD COLUMN ship_id INTEGER REFERENCES ships (id) ON DELETE SET NULL;
