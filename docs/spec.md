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

Works, expanding to chapters, expanding to scenes. Click a work to open the work overview; click a scene to open it in the main pane; click a chapter to open the chapter overview. Shows scene status at a glance. New works, chapters and scenes are created here. Home, above the works, opens the home page.

### 2. Scene detail (main pane)

The primary working view. Shows the scene's own fields — title, POV, status, position, wordcount — and its beats beneath them, in order.

Beats are editable in place: add, edit, reorder, change kind or status, set or clear the paragraph reference. `kind` and `pov` inputs offer previously-used values as you type. The beat list makes planned-versus-landed visible, so the view answers "what is this scene still missing?"

The scene's notes are shown and editable here.

### 3. Chapter overview (main pane)

Every scene in the chapter as a table: position, title, POV, status, wordcount, and a count of its beats by status. Chapter wordcount as a total. This is the view that replaces reading across spreadsheet rows — the shape of the chapter should be readable without clicking into anything.

The chapter's notes are shown and editable here.

A Read chapter link opens the whole chapter's prose: every scene in order on one page, each numbered by paragraph from 1, with a jump list to each scene and links to the previous and next chapter.

### 4. Scene prose viewer (main pane)

Read-only display of the scene's markdown file **with paragraph numbers shown**. This exists specifically so a paragraph reference can be located, and so a beat can be pointed at a real passage. No editing, no formatting toolbar.

Previous and next links move through the work's scenes in reading order, across chapter ends.

### 5. Work overview (main pane)

The work's home page. At the top: the title, a link to the work page if one is set, its fandom and ship (or gen), and the work's total wordcount. Below that, the work's notes. Then every chapter as a simple table: number, title, wordcount, status, and the chapter link if one is set. Clicking a chapter opens its chapter overview.

### 6. Home page (main pane)

The screen the app opens on. At the top, the total wordcount across every work. Below it, every work, grouped by fandom (works with none last), each group with its own wordcount, as a simple table: title, ship, chapter count, wordcount, and the work link if one is set. Clicking a work opens its work overview.

### What the app does not have in v1

No search, no settings UI beyond picking the library root, no themes, no keyboard-shortcut system, no onboarding, no splash screen.

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

Four tables in a straight chain: a work has chapters, a chapter has scenes, a scene has beats. Beside the chain, two small tables name each work's fandom and ship. Every relationship is one-to-many; nothing is many-to-many.

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
| fandoms | name | Unique, ignoring case |
| ships | fandom_id | FK to fandoms |
| ships | name | Unique within its fandom, ignoring case |

### Notes are about the prose, not prose

`notes` on works, chapters and scenes are plain multi-line text, written in the app: inspiration, where supporting files live, anything worth remembering. They describe the prose and never hold it, so the rule that no field lives in both stores still holds. Any `http` or `https` URL in a note is shown as a link.

### Beats are deliberately heterogeneous

A beat is any thing that belongs in a scene: a plot point, a line, an image, a continuity note. One table handles all of them, distinguished by `kind`, because all of them are text that belongs somewhere in a scene. No separate tables per category.

The pairing of `status` and `paragraph_ref` is what makes the app better than the spreadsheet: a scene can report how many of its planned beats have actually landed in the draft, and where.

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

### Suggestion-sourced free text

`beats.kind` and `scenes.pov` are free text. The app offers previously-used values as suggestions, pulled live from existing rows with a DISTINCT query.

There is no lookup table for either. The vocabulary emerges from use rather than being declared up front, there is nothing to maintain, and a new kind of beat never requires a schema change. A "kinds I have used, and how often" view falls out of the same query for free.

### Fandoms and ships

Unlike kinds and POVs, fandoms and ships are tables, because a ship belongs to a fandom. They're still typed as free text in the work form, offered from existing names; a new name adds a row, and a name no work uses any more is removed.

## File handling

The v1 write boundary, stated precisely because it is easy to widen by accident:

- The app **may read** any file under the library root
- The app **may create** a new empty scene file when a scene is created
- The app **must never write to a file that has content**

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

- Editing prose in the app
- Wordcount history or progress-over-time
- Cross-reference search across beats
- Chapter file assembly for posting
- Any import from the existing spreadsheet beyond a one-off
- Accounts, sync, sharing, or anything multi-user

**v2 candidates**, in rough order of how interesting they are to build:

1. In-app prose editing — the riskiest change, since it gives the app write access to real drafts
2. Wordcount history — a snapshots table, written on a scan the user triggers
3. Cross-reference views — every scene where a given beat kind or POV appears

Anything added in v2 must not break the two rules this model rests on: no field in both stores, and no stored wordcounts outside a snapshots table.
