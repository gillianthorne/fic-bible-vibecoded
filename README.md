# Fic Bible

A local desktop app for tracking the structure of fanfiction: works →
chapters → scenes → beats. Prose lives in markdown files; structure lives in
SQLite. Runs on Windows and Linux. The design is in [docs/spec.md](docs/spec.md).

## Development

```bash
npm install
npm run dev
```

`npm install` also rebuilds the native SQLite module against Electron
(`postinstall`). Other scripts: `npm test`, `npm run migrate`, `npm run seed`,
`npm run dev:test` (runs the app against the seeded test library).

## Building an installer

Packaging uses [electron-builder](https://www.electron.build/) with the config
in `electron-builder.yml`. Output goes to `dist/`.

**Build each platform on that platform.** The SQLite module (`better-sqlite3`)
is compiled from source on the build machine against Electron's headers, and
that compile can't target another OS. A Windows machine can't build the Linux
package, and the reverse is also true. The build stops with an error if you try.

Always build through the npm scripts below. They set the flag that forces
the from-source compile, and the build refuses to run without it.

The build downloads Electron, Electron's headers, and the packaging tools
the first time it runs. That download happens at build time only. The app
itself never makes a network request.

### Windows

Prerequisites:

- Node.js and npm
- Python 3
- Visual Studio Build Tools with the "Desktop development with C++" workload

```bash
npm install
npm run dist:win
```

Output: `dist/Fic Bible Setup <version>.exe`, an NSIS installer. It installs
for the current user, lets you choose the install folder, and adds a Start
menu entry and an uninstaller. `dist/win-unpacked/` holds the same app
unpacked, which you can run directly without installing.

The installer is unsigned, so Windows SmartScreen will warn the first time it runs.

### Linux

Prerequisites (Debian/Ubuntu names):

- Node.js and npm
- `build-essential` and `python3`, for compiling the SQLite module
- To run the AppImage on Ubuntu 22.04 and later: `libfuse2`
  (`libfuse2t64` on 24.04)

```bash
sudo apt install build-essential python3
```

```bash
npm install
npm run dist:linux
```

Output: an `.AppImage` and a `.deb` in `dist/`.

Before publishing the deb, replace the placeholder `maintainer` address in
`electron-builder.yml`.

## Where the installed app keeps its data

The database and config live in Electron's per-user application data
folder, not inside the installed app:

| Platform | Folder |
| --- | --- |
| Windows | `%APPDATA%\Fic Bible\` |
| Linux | `~/.config/Fic Bible/` |

- `fic-bible.sqlite` is the database. It is created and migrated on first start.
- `config.json` gives the location of your library folder. The app never
  writes this file, so create it yourself:

  ```json
  { "libraryRoot": "C:\\Users\\you\\Documents\\fic-library" }
  ```

  The path must be absolute. On Linux, write it as `"/home/you/fic-library"`.
  Without this file the app still starts, but it can't find any prose.

`npm run dev` uses the **same** folder, so the dev app and the installed app
share one database and one `config.json`.

## What ships in the package

The `files` list in `electron-builder.yml` controls what goes into the
package. It includes only the built app (`out/`), `package.json`, the SQL
migrations, and the runtime dependencies. The seeder (`scripts/`), the tests
(`test/`), `dev-library/` and `library/` are not included.
