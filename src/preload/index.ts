import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IpcChannel, FileZenApi, ScanProgressPayload } from '../shared/types'

const api: FileZenApi = {
  startScan: (payload) => ipcRenderer.send(IpcChannel.ScanStart, payload),
  cancelScan: (payload) => ipcRenderer.send(IpcChannel.ScanCancel, payload),

  onScanProgress: (handler) => {
    const subscription = (_: IpcRendererEvent, data: ScanProgressPayload) => handler(data)
    ipcRenderer.on(IpcChannel.ScanProgress, subscription)
    return () => ipcRenderer.removeListener(IpcChannel.ScanProgress, subscription)
  },

  moveToQuarantine: (payload) => ipcRenderer.invoke(IpcChannel.ActionQuarantine, payload),
  sendToTrash: (payload) => ipcRenderer.invoke(IpcChannel.ActionTrash, payload),

  getSettings: () => ipcRenderer.invoke(IpcChannel.SettingsGet),
  saveSettings: (settings) => ipcRenderer.invoke(IpcChannel.SettingsSave, settings),
  openDirectory: () => ipcRenderer.invoke(IpcChannel.DialogOpen),
  getResults: (sessionId) => ipcRenderer.invoke(IpcChannel.GetResults, sessionId),
  getSuggestions: (sessionId) => ipcRenderer.invoke(IpcChannel.GetSuggestions, sessionId),
  moveFiles: (payload) => ipcRenderer.invoke(IpcChannel.ActionMove, payload),
  aiSearch: (query) => ipcRenderer.invoke(IpcChannel.AiSearch, query),
  redactText: (text) => ipcRenderer.invoke(IpcChannel.RedactText, text),
  generateProjectDna: (folderPath) => ipcRenderer.invoke(IpcChannel.GenerateProjectDna, folderPath)
}

contextBridge.exposeInMainWorld('fileZen', api)
