import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'

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

ipcMain.handle('status:get', () => ({ ok: true }))

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
