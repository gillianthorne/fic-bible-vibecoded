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

Six views in v1. A persistent sidebar on the left, one main pane on the right.

Above the main pane, a Back button returns to the previous screen, and a breadcrumb (Home / work / chapter / scene) opens any level above the current one. History lasts until the app closes.

### 1. Navigation tree (sidebar, always visible)

Works, expanding to chapters, expanding to scenes. Click a work to open the work overview; click a scene to open it in the main pane; click a chapter to open the chapter overview. Shows scene status at a glance. New works, chapters and scenes are created here. Each is added at the end: the next chapter number, or the next scene position in its chapter. Home, above the works, opens the home page.

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

The screen the app opens on. At the top, the total wordcount across every work. Below it, every work, grouped by fandom (works with none last), each group with its own wordcount, as a simple table: title, ship, chapter count, wordcount, and the work link if one is set. Clicking a work opens its work overview.

### What the app does not have in v1

No search, no settings UI beyond picking the library root, no themes, no keyboard-shortcut system, no onboarding, no splash screen. (The prose editor's own Ctrl-B, Ctrl-I and Ctrl-S work only inside the editor, and are not a shortcut system.)

## Storage model

Two stores, split by what they hold. **Prose lives in markdown files. Structure lives in SQLite.**

The rule that keeps them from drifting: **no field lives in both places.** Files own the words; the database owns everything about the words. Database rows point at files; they never contain prose. If a scene's text ever ends up in a column, the rule has been broken.

Why this split rather than one or the other:

- Markdown files mean the drafts stay readable and editable without the app, work with git, and are not trapped in software built in a week
- SQLite means the structural data is queryable and consistent, where it would get chaotic as JSON, and remains inspectable in sqlitebrowser when the app misbehaves

### Path layering

Paths nest rather than repeating. Each level stores only its own segment, relative to its parent:

- **App config** holds the library root — one value, the only absolute path anywhere
- **Work** holds a folder name, relative to the library root
- **Chapter** holds a folder name, relative to its work's folder
- **Scene** holds a filename only

A scene's full path is assembled at runtime from those four parts. Absolute paths are never stored in the database: moving or renaming the project is then a one-line config change rather than an UPDATE across every row.

## Data model

Four tables in a straight chain: a work has chapters, a chapter has scenes, a scene has beats. A scene also has edit notes (v2), beside its beats. Beside the chain, two small tables name each work's fandom and ship. Every relationship is one-to-many; nothing is many-to-many.

| Table | Field | Notes |
| --- | --- | --- |
| works | title | |
| works | folder | Relative to the library root in config |
| works | url | Link to the work page (e.g. AO3), null until set |
| works | notes | Free text: inspiration, anything general |
| works | fandom_id | FK to fandoms, null until set |
| works | ship_id | FK to ships, null for gen or until set; always a ship in the work's fandom |
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
| fandoms | name | Unique, ignoring case |
| ships | fandom_id | FK to fandoms |
| ships | name | Unique within its fandom, ignoring case |

### Notes are about the prose, not prose

`notes` on works, chapters and scenes are plain multi-line text, written in the app: inspiration, where supporting files live, anything worth remembering. They describe the prose and never hold it, so the rule that no field lives in both stores still holds. Any `http` or `https` URL in a note is shown as a link.

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

### Suggestion-sourced free text

`beats.kind`, `edit_notes.kind` and `scenes.pov` are free text. Beat kinds and edit-note kinds are suggested separately. The app offers previously-used values as suggestions, pulled live from existing rows with a DISTINCT query.

There is no lookup table for either. The vocabulary emerges from use rather than being declared up front, there is nothing to maintain, and a new kind of beat never requires a schema change. A "kinds I have used, and how often" view falls out of the same query for free.

### Fandoms and ships

Unlike kinds and POVs, fandoms and ships are tables, because a ship belongs to a fandom. They're still typed as free text in the work form, offered from existing names; a new name adds a row, and a name no work uses any more is removed.

## File handling

The v1 write boundary, stated precisely because it is easy to widen by accident:

- The app **may read** any file under the library root
- The app **may create** a new empty folder when a work or chapter is created, and a new empty scene file when a scene is created. Each is named as import expects (a work's folder is its title; a chapter is `##-title`; a scene is `##-title.md`) and always comes after the existing ones. If the name is already taken on disk, nothing is created.
- The app **must never write to a file that has content**, with one exception, added in v2: saving a scene from the prose editor

Saving from the prose editor is the only write to an existing file, and it is guarded:

- It writes only that scene's own file, the one its row points at
- It refuses to save if the file has changed on disk since the editor opened it (another editor, a sync client), and says so rather than overwriting
- It writes to a temporary file beside the scene, then renames it over the original, so a failed save leaves the old file whole
- It keeps the file's line endings (CRLF or LF) and any byte-order mark as they were. A file that mixes CRLF and LF is saved with whichever it uses most
- Saving text that hasn't changed writes nothing
- A file that isn't valid UTF-8 can't be opened in the editor, since saving it would change bytes the author never touched

Creating a scene creates its file immediately, empty. A scene therefore always has a file and always has a wordcount, which is zero until it is written. This keeps outlining ahead of drafting possible without making `filename` nullable or special-casing missing files everywhere.

The app does not rename, move or delete prose files in v1, and it does not assemble chapter files. Deleting a scene row leaves its file on disk.

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

Anything added in v2 must not break the two rules this model rests on: no field in both stores, and no stored wordcounts outside a snapshots table.
