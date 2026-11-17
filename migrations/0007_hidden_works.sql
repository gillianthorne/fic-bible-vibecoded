-- Hiding a work (docs/spec.md, Navigation tree): a hidden work leaves the
-- sidebar's work list, the home page and search, and is listed under
-- Hidden works instead. Nothing is deleted; its folder and files are
-- untouched. 0 is shown, 1 is hidden.

ALTER TABLE works ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1));
