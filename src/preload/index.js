import { contextBridge, ipcRenderer } from 'electron'

// Everything the renderer can ask the main process for. Each call resolves
// to { ok: true, data } or { ok: false, error }.
contextBridge.exposeInMainWorld('ficBible', {
  getStatus: () => ipcRenderer.invoke('status:get'),
  navigationTree: () => ipcRenderer.invoke('nav:tree'),
  chapterOverview: (chapterId) => ipcRenderer.invoke('chapter:overview', chapterId),
  sceneDetail: (sceneId) => ipcRenderer.invoke('scene:detail', sceneId),
  sceneProse: (sceneId) => ipcRenderer.invoke('scene:prose', sceneId)
})
