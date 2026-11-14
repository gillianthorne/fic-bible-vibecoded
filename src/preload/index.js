import { contextBridge, ipcRenderer } from 'electron'

// Everything the renderer can ask the main process for. Each call resolves
// to { ok: true, data } or { ok: false, error }.
contextBridge.exposeInMainWorld('ficBible', {
  getStatus: () => ipcRenderer.invoke('status:get'),
  libraryInfo: () => ipcRenderer.invoke('library:info'),
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  importLibrary: () => ipcRenderer.invoke('library:import'),
  navigationTree: () => ipcRenderer.invoke('nav:tree'),
  chapterOverview: (chapterId) => ipcRenderer.invoke('chapter:overview', chapterId),
  sceneDetail: (sceneId) => ipcRenderer.invoke('scene:detail', sceneId),
  sceneProse: (sceneId) => ipcRenderer.invoke('scene:prose', sceneId),
  createBeat: (sceneId, fields) => ipcRenderer.invoke('beat:create', sceneId, fields),
  updateBeat: (beatId, patch) => ipcRenderer.invoke('beat:update', beatId, patch),
  moveBeat: (beatId, direction) => ipcRenderer.invoke('beat:move', beatId, direction),
  deleteBeat: (beatId) => ipcRenderer.invoke('beat:delete', beatId)
})
