import { contextBridge, ipcRenderer } from 'electron'

// Everything the renderer can ask the main process for. Each call resolves
// to { ok: true, data } or { ok: false, error }.
contextBridge.exposeInMainWorld('ficBible', {
  getStatus: () => ipcRenderer.invoke('status:get'),
  libraryInfo: () => ipcRenderer.invoke('library:info'),
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  importLibrary: () => ipcRenderer.invoke('library:import'),
  navigationTree: () => ipcRenderer.invoke('nav:tree'),
  libraryOverview: () => ipcRenderer.invoke('library:overview'),
  workOverview: (workId) => ipcRenderer.invoke('work:overview', workId),
  chapterOverview: (chapterId) => ipcRenderer.invoke('chapter:overview', chapterId),
  sceneDetail: (sceneId) => ipcRenderer.invoke('scene:detail', sceneId),
  sceneProse: (sceneId) => ipcRenderer.invoke('scene:prose', sceneId),
  createBeat: (sceneId, fields) => ipcRenderer.invoke('beat:create', sceneId, fields),
  updateBeat: (beatId, patch) => ipcRenderer.invoke('beat:update', beatId, patch),
  moveBeat: (beatId, direction) => ipcRenderer.invoke('beat:move', beatId, direction),
  deleteBeat: (beatId) => ipcRenderer.invoke('beat:delete', beatId),
  updateScene: (sceneId, patch) => ipcRenderer.invoke('scene:update', sceneId, patch),
  updateChapter: (chapterId, patch) => ipcRenderer.invoke('chapter:update', chapterId, patch),
  updateWork: (workId, patch) => ipcRenderer.invoke('work:update', workId, patch),
  suggestions: () => ipcRenderer.invoke('suggestions'),
  openLink: (url) => ipcRenderer.invoke('link:open', url)
})
