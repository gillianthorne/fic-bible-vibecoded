# Fic Bible — Design Spec

## Purpose and scope

A queryable fic bible: the structural notes that currently live in a spreadsheet, held in a real data model so the app can answer questions a spreadsheet cannot.

The spreadsheet fails at four things, and the app exists to fix them:

- Cross-referencing — finding every scene where a thread, object or callback appears requires manual scanning
- Seeing shape at a glance — rows do not show pacing, POV balance, or where a thread goes quiet
- Staying current — upkeep is manual enough that it drifts out of date
- Linking to the prose — no way to get from a row to the passage it describes

**v1 scope:** replace the first two pages of the existing spreadsheet. Scenes, beats, what each scene is meant to contain, and wordcounts. Read-only against the prose, with one exception noted under file handling.

**Single user.** No accounts, no sharing, no concurrent access.

## Platform and stack

A desktop **Electron** application, running on both Linux and Windows from the same codebase. Not a web app, not a CLI, not a browser tab.

| Layer | Choice |
| --- | --- |
| Shell | Electron |
| UI | React |
| Database | SQLite, local file |
| Prose | Markdown files on the local filesystem |
| Network | None — the app never makes a network request |

**Links.** Work links, chapter links, and URLs inside notes open in the user's default browser, handed over through the operating system. The app itself fetches nothing. Only `http` and `https` links are opened.

**The data is per-machine.** Each laptop has its own library folder and its own database. The app does not sync, and nothing is shared between the two machines. The requirement is that the app *runs* on both, not that it shows the same fic on both.

The app must be packaged and installable on both platforms — running it from a dev server does not count as working.

## Screens

Six views in v1, and five more in v2 (character profile, search, line dictionary, timeline, note pages). A persistent sidebar on the left, one main pane on the right.

Above the main pane, a Back button returns to the previous screen, and a breadcrumb (Home / work / chapter / scene, Home / work / character, or Home / work / Lines, Timeline or a note page) opens any level above the current one. History lasts until the app closes. Beside the breadcrumb, a search box (v2) searches every work's characters: see Search.

### 1. Navigation tree (sidebar, always visible)

Works, each expanding to two groups, Characters (v2) and Chapters. Characters lists the work's characters by name; Chapters expands to chapters, expanding to scenes. Click a work to open the work overview; click a character to open their profile; click a scene to open it in the main pane; click a chapter to open the chapter overview. Shows scene status at a glance. New works, characters, chapters and scenes are created here. Each chapter and scene is added at the end: the next chapter number, or the next scene position in its chapter. Home, above the works, opens the home page.

Each work also has a third group, Notes (v2), holding the work's Lines (the line dictionary), its Timeline, and its note pages by name. New note pages are created here, at the end of the list.

A work can be hidden (v2), for test works or ones set aside without deleting them. Each work's row has a Hide button, shown on hover or focus. A hidden work leaves the list of works, the home page (its table and its total wordcount) and search, and is listed instead in a Hidden works group at the bottom of the sidebar, folded by default. There it expands and opens as any work does, and has Unhide in place of Hide. Hiding changes only the database: the work's folder and files are untouched, and nothing is deleted.

### 2. Scene detail (main pane)

The primary working view. Shows the scene's own fields — title, POV, status, position, wordcount — and its beats beneath them, in order.

Beats are editable in place: add, edit, reorder, change kind or status, set or clear the paragraph reference. `kind` and `pov` inputs offer previously-used values as you type. The beat list makes planned-versus-landed visible, so the view answers "what is this scene still missing?"

The scene's notes are shown and editable here.

Below the beats, the scene's edit notes (v2) as a table: paragraph, kind, note, status, in paragraph order. Each is editable in place — change its paragraph, kind, note or status — and can be added or deleted here. The count of open edit notes shows what revising this scene still has left to do.

### 3. Chapter overview (main pane)

Every scene in the chapter as a table: position, title, POV, status, wordcount, and a count of its beats by status. Chapter wordcount as a total. This is the view that replaces reading across spreadsheet rows — the shape of the chapter should be readable without clicking into anything.

The chapter's notes are shown and editable here.

Below the scenes, every edit note in the chapter (v2), grouped by kind — ignoring case, with notes that have no kind last — and within each kind by scene, then paragraph. Only open notes show, with a count of the rest and a toggle to show them too. Each note's status, paragraph, kind and text are editable in place, and it can be deleted, as on the scene detail; its scene's name opens that scene.

A Read chapter link opens the whole chapter's prose: every scene in order on one page, each numbered by paragraph from 1, with a jump list to each scene and links to the previous and next chapter.

### 4. Scene prose viewer (main pane)

Read-only display of the scene's markdown file **with paragraph numbers shown**. This exists specifically so a paragraph reference can be located, and so a beat can be pointed at a real passage. No editing, no formatting toolbar: editing is a separate screen, opened from an Edit prose button here and on the scene detail.

Clicking a paragraph number opens a small form to add an edit note at that paragraph (v2): a correction or a note to self, for the next revising pass. Paragraphs with edit notes show them just before their number, as the editor does: a small numbered badge for each status the paragraph's notes have, giving how many — open (yellow), fixed (green), ignored (grey), cut (red), always in that order. Clicking the badges opens the paragraph's notes beside it, where each can have its status set or be edited in full. Adding or editing a note changes a database row only; the prose stays read-only.

Previous and next links move through the work's scenes in reading order, across chapter ends.

### 4a. Scene prose editor (main pane, v2)

Edits one scene's markdown file. It is a separate screen from the viewer, so reading a scene never risks changing it.

The editor shows the markdown source, with its markers (`**`, `*`, `#`, `>`) left visible, and styles the text as it would read: bold text is bold, italic text is italic, headings are larger. Paragraph numbers, counted exactly as the viewer counts them, are shown in the margin, and the scene's paragraph count and wordcount update as you type.

A toolbar formats the selection: bold, italic, strikethrough, heading, blockquote, bulleted and numbered list, and a scene break. Bold and italic also have Ctrl-B and Ctrl-I (Cmd on a Mac). Each toggles: applied to text that already has it, it takes it off. Typing the markdown by hand works the same as using the buttons. No images.

Paragraphs with edit notes show the same status badges in the margin, just before their number, as in the viewer. Clicking them opens the paragraph's notes beside it, where each can have its status set or be edited in full, and a new one added. Clicking a paragraph number opens the same, ready to add a note at that paragraph, numbered as the text is at that moment. Beside the editor, a panel lists the scene's edit notes in paragraph order; it always starts collapsed, for every scene. Clicking one moves the cursor to its paragraph. Each note's status can be set from the panel (open, fixed, ignored, cut), and the change is saved straight away, separately from the prose: it is a database row, not part of the file, so it neither needs Save nor counts as an unsaved change.

Saving is explicit, with a Save button or Ctrl-S. There is no autosave. Leaving the editor, or closing the app, with unsaved changes asks first. The chapter read view stays read-only.

### 5. Work overview (main pane)

The work's home page. At the top: the title, a link to the work page if one is set, its fandom and ship (or gen), and the work's total wordcount. Below that, the work's notes. Then every chapter as a simple table: number, title, wordcount, status, and the chapter link if one is set. Clicking a chapter opens its chapter overview.

### 6. Home page (main pane)

The screen the app opens on. At the top, the total wordcount across every work that isn't hidden. Below it, every such work, grouped by fandom (works with none last), each group with its own wordcount, as a simple table: title, ship, chapter count, wordcount, and the work link if one is set. Clicking a work opens its work overview.

### 7. Character profile (main pane, v2)

One character in one work. At the top, the three fields every character has: name, age in the fic, and birthday. Each is free text: an age can be "17" or "early thirties", and a birthday can be "14 March" with or without a year.

Below those, the character's own fields, in an order the author sets: as many as wanted, each a label and a value, both free text. They hold whatever this character and this fic need — "Team: Toronto", "Position: left wing", "Tims order: medium double-double", "Bagel order: everything, plain cream cheese". Each is editable in place, can be reordered, added or deleted. Labels offer previously-used labels as you type, from every work's characters, so a label used once ("Position") is offered for the next character.

Below the fields, the character's notes: freeform text with no labels, for anything that isn't a field. They live in the character's own markdown file (see Work folder layout), not in the database, and are edited here with the same editor as scene prose (see Scene prose editor): markdown markers left visible and the text styled as it would read, the same formatting toolbar, and Ctrl-B and Ctrl-I. Unlike the scene editor, it shows no paragraph numbers, wordcount or edit notes. Saving is explicit, with a Save button or Ctrl-S, under the same guards as saving a scene (see File handling). There is no autosave; leaving the profile, or closing the app, with unsaved notes asks first. Field edits are database rows and save straight away, separately from the notes.

Deleting a character deletes their row and fields; their notes file is left on disk.

### 8. Search (main pane, v2)

Typing in the search box and pressing Enter lists every character, across every work that isn't hidden, that matches. A character matches when the search text appears, ignoring case, in their name, age, birthday, any field's label or value, or their notes file. "bagel" finds every bagel order written down anywhere.

Results are grouped by work. Each shows the character's name and what matched: the field as "label: value", or a line of the notes around the match. Clicking a result opens that character's profile.

Notes files are read at search time, as wordcounts are. Nothing from them is copied into the database to make searching faster: an index of their text would be a field in both stores.

### 9. Line dictionary (main pane, v2)

Every line the author has planned or written for one work, as a table: line, type, speaker, chapter, scene, status and notes. A line is a piece of dialogue or text worth tracking on its own: a refrain that comes back ("refrain 1"), a set of chirps for one chapter ("ch 1 chirps"), a callback.

Lines are grouped by type, types in name order, with lines that have no type last. Within a group, the table can be sorted by any column by clicking its header; the sort lasts until the app closes and isn't stored. Unsorted, a group runs in chapter order, then scene order, then the order lines were added, with lines that have no chapter last.

- **Type** and **speaker** are free text. Type offers types already used in this work; speaker offers this work's character names and speakers already used in it.
- **Chapter, scene and beat** are each optional, chosen from this work's own: a scene from the chosen chapter, a beat from the chosen scene. A planned line can have none of them yet. The beat link says which beat plans this line in its scene.
- **Status** is planned, used or dropped. A used line's chapter and scene show as links that open them; a planned or dropped line shows them as plain text.
- **Notes** are free text, as on beats.

Each line is editable in place, and can be added or deleted here. Lines describe the prose and never hold it: a used line's text in the dictionary is a record of it, not the scene's copy.

### 10. Timeline (main pane, v2)

The work's events in the order they happen in the story, which isn't always chapter order: each entry an event, an in-fic date, an optional chapter, and notes.

- **Date** is free text ("Day 3", "October 2024", "the night before the final"), shown as written. It isn't parsed or used to sort.
- **Order** is set by the author, moving entries up and down as character fields are; new entries go at the end.
- **Chapter** is optional, chosen from the work's chapters, and shown as a link that opens it.

Each entry is editable in place, and can be added or deleted here.

### 11. Note pages (main pane, v2)

Freeform writing about the work, with nothing predefined: the author makes as many pages as they like, names each whatever they like ("Logline", "Theme", "random 3am thoughts"), and writes anything in them. The app gives a page no structure, fields or required headings; what goes in it is entirely the author's.

Each page is one markdown file in the work's `notes/` folder, named for the page (`notes/Logline.md`), and opens on its own screen, edited with the same editor as a character's notes (see Character profile): the prose editor's markdown editing and toolbar, explicit Save, no paragraph numbers.

Pages are listed in the sidebar's Notes group, after Lines and Timeline, in an order the author sets, moving them up and down. Deleting a page removes it from the list; its file stays on disk. A page's name can be changed at any time, as a chapter's title can: the name shown in the sidebar and on the page is a database column, and the file keeps the name it was created with, because the app doesn't rename files.

The work's existing `notes` field, shown on the work overview, stays as it is: a short note in the database, beside the note pages rather than replaced by them.

### What the app does not have in v1

No search (character search added in v2: see Search), no settings UI beyond picking the library root, no themes, no keyboard-shortcut system, no onboarding, no splash screen. (The prose editor's own Ctrl-B, Ctrl-I and Ctrl-S work only inside the editor, and are not a shortcut system.)

## Storage model

Two stores, split by what they hold. **Prose lives in markdown files. Structure lives in SQLite.**

The rule that keeps them from drifting: **no field lives in both places.** Files own the words; the database owns everything about the words. Database rows point at files; they never contain prose. If a scene's text ever ends up in a column, the rule has been broken.

Why this split rather than one or the other:

- Markdown files mean the drafts stay readable and editable without the app, work with git, and are not trapped in software built in a week
- SQLite means the structural data is queryable and consistent, where it would get chaotic as JSON, and remains inspectable in sqlitebrowser when the app misbehaves

### Work folder layout

Each work's folder holds three folders, with fixed names (v2):

```
<library root>/
  <work folder>/
    characters/
      <name>.md         a character's notes
    notes/
      <name>.md         a note page
    chapters/
      ##-<title>/       a chapter
        ##-<title>.md   a scene
```

Before v2, chapter folders sat directly in the work folder. Works laid out that way are moved into `chapters/` by the author, by hand, before using v2: the app does not move files. A work folder with no `chapters/` folder is reported by import, and its scenes can't be opened until it is reorganised.

### Path layering

Paths nest rather than repeating. Each level stores only its own segment, relative to its parent:

- **App config** holds the library root — one value, the only absolute path anywhere
- **Work** holds a folder name, relative to the library root
- **Chapter** holds a folder name, relative to its work's `chapters/` folder
- **Scene** holds a filename only
- **Character** holds a filename only, relative to its work's `characters/` folder
- **Note page** holds a filename only, relative to its work's `notes/` folder

A scene's full path is assembled at runtime from those four parts, with the fixed `chapters` segment between the work and the chapter; a character's notes path from the library root, the work folder, the fixed `characters` segment and the filename; a note page's the same way, with `notes`. The fixed segments are never stored, so moving existing chapter folders into `chapters/` needs no change to any row. Absolute paths are never stored in the database: moving or renaming the project is then a one-line config change rather than an UPDATE across every row.

## Data model

Four tables in a straight chain: a work has chapters, a chapter has scenes, a scene has beats. A scene also has edit notes (v2), beside its beats. A work also has characters (v2), and a character has fields. A work also has lines, timeline events and note pages (v2); a line may point at a chapter, a scene and a beat of its own work, and a timeline event at a chapter. Beside the chain, two small tables name each work's fandom and ship. Characters live in the same database as everything else: there is one database file, never one per work. Every relationship is one-to-many; nothing is many-to-many.

| Table | Field | Notes |
| --- | --- | --- |
| works | title | |
| works | folder | Relative to the library root in config |
| works | url | Link to the work page (e.g. AO3), null until set |
| works | notes | Free text: inspiration, anything general |
| works | fandom_id | FK to fandoms, null until set |
| works | ship_id | FK to ships, null for gen or until set; always a ship in the work's fandom |
| works | hidden | 0 or 1, default 0; a hidden work is listed only under Hidden works (v2) |
| chapters | work_id | FK to works |
| chapters | number | Chapter number |
| chapters | title | |
| chapters | folder | Relative to the work's folder |
| chapters | status | Drafting / ready to post / posted |
| chapters | posted_date | Null until posted |
| chapters | posted_url | AO3 link, null until posted |
| chapters | notes | Free text |
| scenes | chapter_id | FK to chapters |
| scenes | position | Ordered within the chapter, not globally |
| scenes | title | |
| scenes | filename | Filename only, no path segments |
| scenes | pov | Free text, suggestion-sourced |
| scenes | status | Fixed vocabulary — see below |
| scenes | notes | Free text: e.g. where a scene's workskin CSS, HTML or images live |
| beats | scene_id | FK to scenes |
| beats | position | Ordered within the scene |
| beats | kind | Free text, suggestion-sourced |
| beats | content | The beat itself — free text |
| beats | status | Fixed vocabulary — see below |
| beats | paragraph_ref | Nullable paragraph number within the scene file |
| edit_notes | scene_id | FK to scenes (v2) |
| edit_notes | paragraph | Paragraph number within the scene file; required |
| edit_notes | kind | Free text, suggestion-sourced; may be blank |
| edit_notes | note | The correction or note itself — free text |
| edit_notes | status | Fixed vocabulary — see below |
| characters | work_id | FK to works (v2) |
| characters | name | Free text; required |
| characters | age | Free text: age in the fic; may be blank |
| characters | birthday | Free text; may be blank |
| characters | filename | The notes file in the work's `characters/` folder; filename only |
| character_fields | character_id | FK to characters (v2) |
| character_fields | position | Ordered within the character |
| character_fields | label | Free text, suggestion-sourced |
| character_fields | value | Free text |
| lines | work_id | FK to works (v2) |
| lines | line | The line itself — free text; required |
| lines | type | Free text, suggestion-sourced; may be blank |
| lines | speaker | Free text, suggestion-sourced; may be blank |
| lines | chapter_id | FK to chapters in the same work; null until set |
| lines | scene_id | FK to scenes in that chapter; null until set; needs a chapter |
| lines | beat_id | FK to beats in that scene; null until set; needs a scene |
| lines | status | Fixed vocabulary — see below |
| lines | notes | Free text, null until set |
| timeline_events | work_id | FK to works (v2) |
| timeline_events | position | Ordered within the work |
| timeline_events | event | Free text; required |
| timeline_events | date | Free text, the in-fic date as written; may be blank |
| timeline_events | chapter_id | FK to chapters in the same work; null until set |
| timeline_events | notes | Free text, null until set |
| note_pages | work_id | FK to works (v2) |
| note_pages | position | Ordered within the work |
| note_pages | name | Free text; required. Editable: the name shown, which may differ from the filename |
| note_pages | filename | The file in the work's `notes/` folder; filename only, never changed |
| fandoms | name | Unique, ignoring case |
| ships | fandom_id | FK to fandoms |
| ships | name | Unique within its fandom, ignoring case |

### Notes are about the prose, not prose

`notes` on works, chapters and scenes are plain multi-line text, written in the app: inspiration, where supporting files live, anything worth remembering. They describe the prose and never hold it, so the rule that no field lives in both stores still holds. Any `http` or `https` URL in a note is shown as a link.

### Character fields are label and value, not columns

Name, age and birthday are columns because every character has them. Everything else is a row in `character_fields`, because what's worth tracking differs by fic: a hockey AU wants team and position, another fic wants neither. A new kind of field never needs a schema change, the same reasoning as beat kinds.

A character's notes are the one part of the profile kept in a file rather than a column. Fields describe the character in short values; the notes are longer writing, and live with the prose. As with every other split, nothing is in both: the notes are never copied into a column.

### Lines are their own table, beside beats

A beat can already be a line, but a beat always sits in a scene, and its lifecycle is about landing in a draft. A line in the dictionary may be planned before it has any scene at all, is tracked across the whole work by type ("refrain 1" in chapters 1, 4 and 12), and has a speaker. So lines are their own table, and the optional `beat_id` joins the two when a beat plans a line in a particular scene. Deleting a chapter, scene or beat clears a line's link to it (and, for a chapter or scene, the links beneath it) rather than deleting the line. That a line's scene is in its chapter, and its beat in its scene, is checked in the main process, as a work's ship is.

### Note pages are files, like character notes

Note pages are freeform longer writing, so they live in markdown files with the prose, as character notes do. The `note_pages` row holds only the name, the filename and the order; the text is never copied into a column, and the app reads nothing into structure from it.

### Beats are deliberately heterogeneous

A beat is any thing that belongs in a scene: a plot point, a line, an image, a continuity note. One table handles all of them, distinguished by `kind`, because all of them are text that belongs somewhere in a scene. No separate tables per category.

The pairing of `status` and `paragraph_ref` is what makes the app better than the spreadsheet: a scene can report how many of its planned beats have actually landed in the draft, and where.

### Edit notes are for revising, beats for planning

A beat says what a scene should contain; an edit note says what to change in what's already written ("tense slips here", "cut this line", "check her eye colour"). Edit notes are their own table rather than a beat kind because they have their own lifecycle — open until dealt with, then fixed, ignored or cut — and because they always point at a paragraph. They have no order of their own: they're listed by paragraph, then in the order they were added. Like beats, they describe the prose and never hold it.

### Scene ordering

Scene `position` is numbered within its chapter, not across the whole work. Inserting a scene renumbers only its own chapter, so breakage stays local.

### Anchoring

References into prose are **scene plus paragraph number**, not line numbers. Line numbers shift whenever anything above them changes; paragraph numbers scoped to a single scene file break only within that file, and only when paragraphs are added or removed above the reference.

## Derived values

**No wordcount is stored anywhere.** All three levels are computed at read time:

- Scene wordcount is read from its file
- Chapter wordcount is the sum of its scenes
- Work wordcount is the sum of its chapters

This is a deliberate rejection of a stored, trigger-maintained column. Wordcounts originate in files, not in database writes, so no database trigger can ever learn that a scene file grew by 400 words. A stored column would require a scan step and would be stale between scans; a computed value cannot be wrong.

The cost is that there is no history — the app knows the current count and nothing about progress over time. Wordcount history is a v2 feature, and it is a separate snapshots table rather than a change to this rule.

## Vocabularies

Two kinds of controlled value, used deliberately for different purposes.

### Fixed lists

Only the status fields have a closed set of values. Each describes progress rather than content:

| Field | Values |
| --- | --- |
| scenes.status | Outlined → drafting → drafted → revised |
| beats.status | Planned → in draft → cut |
| chapters.status | Drafting → ready to post → posted |
| edit_notes.status | Open → fixed / ignored / cut |
| lines.status | Planned → used / dropped |

### Suggestion-sourced free text

`beats.kind`, `edit_notes.kind`, `character_fields.label`, `scenes.pov`, `lines.type` and `lines.speaker` are free text. Beat kinds, edit-note kinds, field labels and line types are suggested separately. Line types and speakers are suggested from the same work only, since "refrain 1" means something different in each fic; speakers are also offered the work's character names. The app offers previously-used values as suggestions, pulled live from existing rows with a DISTINCT query.

There is no lookup table for either. The vocabulary emerges from use rather than being declared up front, there is nothing to maintain, and a new kind of beat never requires a schema change. A "kinds I have used, and how often" view falls out of the same query for free.

### Fandoms and ships

Unlike kinds and POVs, fandoms and ships are tables, because a ship belongs to a fandom. They're still typed as free text in the work form, offered from existing names; a new name adds a row, and a name no work uses any more is removed.

## File handling

The v1 write boundary, stated precisely because it is easy to widen by accident:

- The app **may read** any file under the library root
- The app **may create** a new empty folder when a work or chapter is created, and a new empty scene file when a scene is created. Each is named as import expects (a work's folder is its title; a chapter is `##-title`; a scene is `##-title.md`) and always comes after the existing ones. If the name is already taken on disk, nothing is created.
- In v2, creating a work also creates its three empty folders, `characters/`, `notes/` and `chapters/`, and a new chapter's folder goes in `chapters/`. Creating a character creates a new empty notes file, `<name>.md`, in the work's `characters/` folder, creating that folder first if it is missing. If the file's name is already taken on disk, or the name can't be used as a filename on both Linux and Windows, nothing is created and the app says why.
- Creating a note page creates a new empty file, `<name>.md`, in the work's `notes/` folder, creating that folder first if it is missing, under the same rules as a character's notes file.
- The app **must never write to a file that has content**, with three exceptions, added in v2: saving a scene from the prose editor, saving a character's notes from their profile, and saving a note page

Those three saves are the only writes to an existing file, and all are guarded the same way:

- It writes only that scene's, character's or note page's own file, the one its row points at
- It refuses to save if the file has changed on disk since the editor opened it (another editor, a sync client), and says so rather than overwriting
- It writes to a temporary file beside the scene, then renames it over the original, so a failed save leaves the old file whole
- It keeps the file's line endings (CRLF or LF) and any byte-order mark as they were. A file that mixes CRLF and LF is saved with whichever it uses most
- Saving text that hasn't changed writes nothing
- A file that isn't valid UTF-8 can't be opened in the editor (or, for a character's notes, edited on the profile), since saving it would change bytes the author never touched

Creating a scene creates its file immediately, empty. A scene therefore always has a file and always has a wordcount, which is zero until it is written. This keeps outlining ahead of drafting possible without making `filename` nullable or special-casing missing files everywhere.

The app does not rename, move or delete prose files in v1, and it does not assemble chapter files. Deleting a scene row leaves its file on disk. The same holds for character notes in v2: renaming a character leaves their file's name as it was, and deleting a character leaves the file.

Import reads `.md` files in a work's `characters/` folder as characters, named by the filename without `.md`, with blank age, birthday and no fields. A file already pointed at by a character row is left alone. `.md` files in a work's `notes/` folder are read the same way, as note pages named by the filename without `.md`, added at the end of the list. Deleting a character or note page leaves its file, so a re-import brings it back.

## Cross-platform requirements

The app must work identically on Linux and Windows. These are the places that normally break, and each is a requirement rather than a nice-to-have:

- **Paths.** Every path is assembled with Node's `path` module. No hardcoded `/` or `\\`, no string concatenation of path segments, no POSIX assumptions.
- **Native SQLite module.** A native module such as `better-sqlite3` is compiled per platform and per Electron version, and must be rebuilt against Electron rather than system Node. This has to be handled in the build setup from the start, not discovered at packaging time.
- **Line endings.** Markdown files may contain CRLF or LF. Paragraph counting and wordcounts must produce the same answer either way, and the app must not rewrite a file's line endings.
- **Filename case.** Linux filenames are case-sensitive, Windows filenames are not. The app must not rely on case-insensitive matching to find a scene file.
- **Config location.** The library root is stored in Electron's per-user application data directory, obtained from Electron's own API rather than a hand-built path.
- **Packaging.** Installable builds for both platforms, produced from the same source.

A feature is not done until it has been run on both machines.

## Out of scope, and v2

Explicitly not in v1:

- Editing prose in the app (added in v2: see Scene prose editor)
- Wordcount history or progress-over-time
- Cross-reference search across beats
- Chapter file assembly for posting
- Any import from the existing spreadsheet beyond a one-off
- Accounts, sync, sharing, or anything multi-user

**v2 candidates**, in rough order of how interesting they are to build:

1. In-app prose editing — the riskiest change, since it gives the app write access to real drafts. Built: see Scene prose editor, and the save rules under File handling
2. Wordcount history — a snapshots table, written on a scan the user triggers
3. Cross-reference views — every scene where a given beat kind or POV appears
4. Synced database — keep the database in the library folder so a cloud folder (e.g. OneDrive) carries it between laptops with the prose. Replaces "the data is per-machine"; a cloud service can't merge a database, so the app would need to warn when it finds a conflict copy
5. Edit notes — per-paragraph corrections and notes for revising, added from the prose viewer and worked through in the editor. Built: see Scene detail, Scene prose viewer, Scene prose editor, and the edit_notes table
6. Characters — a profile per character in each work, with fixed fields, the author's own label-and-value fields, and freeform notes in a file, plus a search across every work's characters. Changes the work folder layout to `characters/`, `notes/` and `chapters/`. See Character profile, Search, Work folder layout, and the characters and character_fields tables
7. Notes — per work: a line dictionary (lines tracked by type, speaker, chapter, scene and status, optionally tied to a beat), a timeline of in-fic events in story order, and freeform note pages as markdown files in the work's `notes/` folder. See Line dictionary, Timeline, Note pages, and the lines, timeline_events and note_pages tables

Anything added in v2 must not break the two rules this model rests on: no field in both stores, and no stored wordcounts outside a snapshots table.
