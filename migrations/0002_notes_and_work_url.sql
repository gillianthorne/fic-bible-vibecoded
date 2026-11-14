-- Notes on works, chapters and scenes, and a link to the work's page
-- (docs/spec.md, Data model and "Notes are about the prose, not prose").
--
-- All nullable: null means not set. Notes describe the prose and never
-- hold it, so the no-field-in-both-stores rule still holds.

ALTER TABLE works ADD COLUMN url TEXT;  -- e.g. AO3 work link, null until set
ALTER TABLE works ADD COLUMN notes TEXT;
ALTER TABLE chapters ADD COLUMN notes TEXT;
ALTER TABLE scenes ADD COLUMN notes TEXT;
