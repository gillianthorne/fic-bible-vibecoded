import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { closeDatabase, databasePath, openDatabase, schemaVersion, sqliteVersion } from './db.js'
import { resolveLibraryRoot } from './config.js'
import { readTestScene } from './scene.js'
import { createHandlers } from './handlers.js'

// Run a check and report its result or its error, so one failure doesn't
// hide the others.
function attempt(fn) {
  try {
    return { ok: true, ...fn() }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function collectStatus() {
  return {
    database: attempt(() => ({
      path: databasePath(),
      sqliteVersion: sqliteVersion(),
      schemaVersion: schemaVersion()
    })),
    library: attempt(() => resolveLibraryRoot()),
    scene: attempt(() => readTestScene(resolveLibraryRoot().libraryRoot))
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // electron-vite sets this in dev so the renderer loads from its local dev server.
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  }

  // Smoke mode: print what React actually rendered, then quit. Lets the spike
  // be checked from a terminal without looking at the window.
  if (process.env.FIC_BIBLE_SMOKE === '1') {
    win.webContents.on('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const text = await win.webContents.executeJavaScript('document.body.innerText')
      console.log('--- renderer text ---\n' + text + '\n--- end ---')
      app.quit()
    })
  }
}

ipcMain.handle('status:get', () => collectStatus())

// The data the screens read. Opened per request so a database or config
// that was broken at startup is retried, and its error shown.
function openLibrary() {
  return { db: openDatabase(), libraryRoot: resolveLibraryRoot().libraryRoot }
}

for (const [channel, handler] of Object.entries(createHandlers(openLibrary))) {
  ipcMain.handle(channel, (_event, ...args) => handler(...args))
}

app.on('will-quit', closeDatabase)

app.whenReady().then(() => {
  // Open and migrate the database at start. A failure isn't fatal here:
  // openDatabase() is retried by the status check, which shows the error.
  try {
    openDatabase()
  } catch (e) {
    console.error(`Database not ready: ${e.message}`)
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
