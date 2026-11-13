import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ficBible', {
  getStatus: () => ipcRenderer.invoke('status:get')
})
