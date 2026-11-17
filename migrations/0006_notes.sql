-- A work's notes (docs/spec.md, Data model; screens 9-11): its line
-- dictionary, its timeline, and its freeform note pages.
--
-- Lines are their own table beside beats. Chapter, scene and beat are
-- each optional; deleting one clears the link (ON DELETE SET NULL) rather
-- than deleting the line. That they're in the line's work, the scene in
-- the chapter and the beat in the scene is checked in edit.js. A scene
-- needs a chapter and a beat needs a scene, checked here too.
--
-- Note pages are markdown files in the work's notes folder. The row holds
-- the name shown (editable, like a chapter's title), the filename (never
-- changed: the app doesn't rename files) and the order.

CREATE TABLE lines (
  id         INTEGER PRIMARY KEY,
  work_id    INTEGER NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  line       TEXT NOT NULL CHECK (trim(line) <> ''),
  type       TEXT NOT NULL DEFAULT '',
  speaker    TEXT NOT NULL DEFAULT '',
  chapter_id INTEGER REFERENCES chapters (id) ON DELETE SET NULL,
  scene_id   INTEGER REFERENCES scenes (id) ON DELETE SET NULL,
  beat_id    INTEGER REFERENCES beats (id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'planned'
             CHECK (status IN ('planned', 'used', 'dropped')),
  notes      TEXT,
  CHECK (scene_id IS NULL OR chapter_id IS NOT NULL),
  CHECK (beat_id IS NULL OR scene_id IS NOT NULL)
) STRICT;

CREATE INDEX lines_work ON lines (work_id, type);
CREATE INDEX lines_chapter ON lines (chapter_id);
CREATE INDEX lines_scene ON lines (scene_id);
CREATE INDEX lines_beat ON lines (beat_id);

-- Deleting a chapter or scene clears the links beneath it as well, so a
-- line never points at a scene without a chapter or a beat without a
-- scene. (SET NULL alone would leave them, and the CHECKs above would
-- then refuse the delete.)
CREATE TRIGGER lines_chapter_deleted BEFORE DELETE ON chapters
BEGIN
  UPDATE lines SET beat_id = NULL, scene_id = NULL, chapter_id = NULL WHERE chapter_id = OLD.id;
END;

CREATE TRIGGER lines_scene_deleted BEFORE DELETE ON scenes
BEGIN
  UPDATE lines SET beat_id = NULL, scene_id = NULL WHERE scene_id = OLD.id;
END;

CREATE TABLE timeline_events (
  id         INTEGER PRIMARY KEY,
  work_id    INTEGER NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  position   INTEGER NOT NULL CHECK (position >= 1),
  event      TEXT NOT NULL CHECK (trim(event) <> ''),
  date       TEXT NOT NULL DEFAULT '',
  chapter_id INTEGER REFERENCES chapters (id) ON DELETE SET NULL,
  notes      TEXT,
  UNIQUE (work_id, position)
) STRICT;

CREATE TABLE note_pages (
  id       INTEGER PRIMARY KEY,
  work_id  INTEGER NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1),
  name     TEXT NOT NULL CHECK (trim(name) <> ''),
  filename TEXT NOT NULL
           CHECK (filename NOT IN ('', '.', '..')
                  AND instr(filename, '/') = 0 AND instr(filename, '\') = 0),
  UNIQUE (work_id, position),
  UNIQUE (work_id, filename COLLATE NOCASE)
) STRICT;
