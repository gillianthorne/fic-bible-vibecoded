-- Edit notes (docs/spec.md, Data model): per-paragraph corrections and
-- notes for revising a scene. They describe the prose and never hold it.
--
-- No position column: notes are listed by paragraph, then by id (the
-- order they were added). kind is free text like beats.kind, but may be
-- blank, so a note can be added from the prose viewer without one.

CREATE TABLE edit_notes (
  id        INTEGER PRIMARY KEY,
  scene_id  INTEGER NOT NULL REFERENCES scenes (id) ON DELETE CASCADE,
  paragraph INTEGER NOT NULL CHECK (paragraph >= 1),  -- 1-based
  kind      TEXT NOT NULL DEFAULT '',
  note      TEXT NOT NULL CHECK (trim(note) <> ''),
  status    TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'fixed', 'ignored', 'cut'))
) STRICT;

CREATE INDEX edit_notes_scene ON edit_notes (scene_id, paragraph);
CREATE INDEX edit_notes_kind ON edit_notes (kind);
