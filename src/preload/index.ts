import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'
import { IpcChannels } from '../shared/ipc-channels'
import type { IpcContract } from '../shared/ipc-contract'
import { DownloadState, NetworkPreference, ThemeSource, UpdateProgress } from '../shared/types'

/** Typed wrapper around ipcRenderer.invoke — the channel name picks its args/result shape out of
 * IpcContract, so a call here that doesn't match what registerIpcHandlers (main) actually handles
 * is a compile error instead of a silent runtime mismatch. */
function invoke<K extends keyof IpcContract>(
  channel: K,
  ...args: IpcContract[K]['args']
): Promise<IpcContract[K]['result']> {
  return ipcRenderer.invoke(IpcChannels[channel], ...args)
}

const uncappedApi = {
  platform: process.platform,

  listInterfaces: () => invoke('listInterfaces'),
  pingInterfaces: () => invoke('pingInterfaces'),
  deviceBindingSupported: () => invoke('deviceBindingSupported'),
  openNetworkSettings: () => invoke('openNetworkSettings'),
  getNetworkPreferences: () => invoke('getNetworkPreferences'),
  setNetworkPreference: (id: string, patch: NetworkPreference) =>
    invoke('setNetworkPreference', id, patch),
  getThemeSource: () => invoke('getThemeSource'),
  setThemeSource: (source: ThemeSource) => invoke('setThemeSource', source),
  probeUrl: (url: string) => invoke('probeUrl', url),
  getInitialPaths: () => invoke('getInitialPaths'),
  chooseDestinationFolder: (defaultPath: string) => invoke('chooseDestinationFolder', defaultPath),
  chooseSourceFile: () => invoke('chooseSourceFile'),
  chooseTorrentFile: () => invoke('chooseTorrentFile'),
  readClipboardText: () => invoke('readClipboardText'),
  revealInFolder: (filePath: string) => invoke('revealInFolder', filePath),
  startDownload: (request: IpcContract['startDownload']['args'][0]) =>
    invoke('startDownload', request),
  startSimulatedDownload: (request: IpcContract['startSimulatedDownload']['args'][0]) =>
    invoke('startSimulatedDownload', request),
  getCurrentDownload: () => invoke('getCurrentDownload'),
  pauseDownload: (downloadId: string) => invoke('pauseDownload', downloadId),
  resumeDownload: (downloadId: string) => invoke('resumeDownload', downloadId),
  cancelDownload: (downloadId: string) => invoke('cancelDownload', downloadId),
  removeDownload: (downloadId: string) => invoke('removeDownload', downloadId),
  deleteDownload: (downloadId: string, filePath?: string, permanent?: boolean, fileName?: string) =>
    invoke('deleteDownload', downloadId, filePath, permanent, fileName),
  checkForUpdate: () => invoke('checkForUpdate'),
  dismissUpdate: (version: string) => invoke('dismissUpdate', version),
  runComparisonSpeedTest: (testUrl: string, interfaceIds: string[]) =>
    invoke('runComparisonSpeedTest', testUrl, interfaceIds),
  cancelShutdown: () => invoke('cancelShutdown'),
  setLatencyShield: (enabled: boolean) => invoke('setLatencyShield', enabled),
  updateDownloadUrl: (id: string, newUrl: string) => invoke('updateDownloadUrl', id, newUrl),
  getZoomFactor: () => invoke('getZoomFactor'),
  setZoomFactor: (factor: number) => {
    webFrame.setZoomFactor(factor)
    return invoke('setZoomFactor', factor)
  },

  onShutdownCountdown: (
    callback: (payload: { remainingSeconds: number; action: string } | null) => void
  ): (() => void) => {
    const listener = (
      _event: IpcRendererEvent,
      payload: { remainingSeconds: number; action: string } | null
    ): void => callback(payload)
    ipcRenderer.on(IpcChannels.shutdownCountdown, listener)
    return () => ipcRenderer.removeListener(IpcChannels.shutdownCountdown, listener)
  },

  onDownloadUpdated: (callback: (state: DownloadState) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: DownloadState): void => callback(state)
    ipcRenderer.on(IpcChannels.downloadUpdated, listener)
    return () => ipcRenderer.removeListener(IpcChannels.downloadUpdated, listener)
  },

  onToggleDevToolsPanel: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(IpcChannels.toggleDevToolsPanel, listener)
    return () => ipcRenderer.removeListener(IpcChannels.toggleDevToolsPanel, listener)
  },

  onZoomChanged: (callback: (factor: number) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, factor: number): void => {
      webFrame.setZoomFactor(factor)
      callback(factor)
    }
    ipcRenderer.on(IpcChannels.zoomChanged, listener)
    return () => ipcRenderer.removeListener(IpcChannels.zoomChanged, listener)
  },

  startUpdateDownload: () => invoke('startUpdateDownload'),
  installUpdateAndRestart: () => invoke('installUpdateAndRestart'),
  getWhatsNew: () => invoke('getWhatsNew'),
  dismissWhatsNew: (version: string) => invoke('dismissWhatsNew', version),

  onUpdateProgress: (callback: (progress: UpdateProgress) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, progress: UpdateProgress): void =>
      callback(progress)
    ipcRenderer.on(IpcChannels.updateProgress, listener)
    return () => ipcRenderer.removeListener(IpcChannels.updateProgress, listener)
  },

  onUpdateDownloaded: (callback: (info: { version: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, info: { version: string }): void => callback(info)
    ipcRenderer.on(IpcChannels.updateDownloaded, listener)
    return () => ipcRenderer.removeListener(IpcChannels.updateDownloaded, listener)
  }
}

export type UnCappedApi = typeof uncappedApi
export type PlexoApi = UnCappedApi

// Nothing in the renderer needs raw Electron/Node access — only the typed uncappedApi above is
// exposed. The @electron-toolkit/preload electronAPI (which hands the renderer an unrestricted
// ipcRenderer.invoke/send/on on any channel) is deliberately not bridged.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('uncapped', uncappedApi)
    contextBridge.exposeInMainWorld('plexo', uncappedApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.uncapped = uncappedApi
  // @ts-ignore (define in dts)
  window.plexo = uncappedApi
}
