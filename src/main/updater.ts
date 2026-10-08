import { app, type BrowserWindow } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateDownloadedEvent } from 'electron-updater'
import { IpcChannels } from '../shared/ipc-channels'
import type { UpdateProgress, WhatsNewItem } from '../shared/types'
import { getWhatsNewForVersion } from '../shared/changelog'
import { loadLastSeenVersion, saveLastSeenVersion } from './settings'

let getMainWindow: (() => BrowserWindow | null) | null = null
let isDownloadInProgress = false
let isUpdateDownloaded = false

export function initAutoUpdater(windowGetter: () => BrowserWindow | null): void {
  getMainWindow = windowGetter

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    isDownloadInProgress = true
    const payload: UpdateProgress = {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    }
    const win = getMainWindow?.()
    win?.webContents.send(IpcChannels.updateProgress, payload)
  })

  autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
    isDownloadInProgress = false
    isUpdateDownloaded = true
    const win = getMainWindow?.()
    win?.webContents.send(IpcChannels.updateDownloaded, { version: event.version })
  })

  autoUpdater.on('error', (err) => {
    isDownloadInProgress = false
    console.warn('[AutoUpdater] Error:', err.message)
  })
}

export async function startUpdateDownload(): Promise<boolean> {
  if (isUpdateDownloaded) return true
  if (isDownloadInProgress) return true

  try {
    if (!app.isPackaged) {
      // In dev mode, simulate download progress so the UI and flow can be verified
      const win = getMainWindow?.()
      isDownloadInProgress = true
      let percent = 0
      const interval = setInterval(() => {
        percent += 25
        const payload: UpdateProgress = {
          percent: Math.min(100, percent),
          bytesPerSecond: 12_500_000,
          transferred: (percent / 100) * 85_000_000,
          total: 85_000_000
        }
        win?.webContents.send(IpcChannels.updateProgress, payload)
        if (percent >= 100) {
          clearInterval(interval)
          isDownloadInProgress = false
          isUpdateDownloaded = true
          win?.webContents.send(IpcChannels.updateDownloaded, { version: app.getVersion() })
        }
      }, 400)
      return true
    }

    isDownloadInProgress = true
    // electron-updater requires checkForUpdates() to establish updateInfoAndProvider before downloadUpdate()
    await autoUpdater.checkForUpdates()
    await autoUpdater.downloadUpdate()
    return true
  } catch (err) {
    console.error('[AutoUpdater] Failed to download update:', err)
    isDownloadInProgress = false
    return false
  }
}

export function installUpdateAndRestart(): boolean {
  try {
    if (!app.isPackaged) {
      console.log('[AutoUpdater] In dev mode: would quit and install')
      return true
    }
    autoUpdater.quitAndInstall(false, true)
    return true
  } catch (err) {
    console.error('[AutoUpdater] Failed to quit and install:', err)
    return false
  }
}

export async function checkWhatsNew(): Promise<WhatsNewItem | null> {
  const currentVersion = app.getVersion()
  const lastSeen = await loadLastSeenVersion()

  if (!lastSeen) {
    // First-ever launch on this machine: record current version so we don't display
    // an update prompt on a brand new fresh installation.
    await saveLastSeenVersion(currentVersion)
    return null
  }

  if (lastSeen !== currentVersion) {
    // App was updated from lastSeen to currentVersion!
    return getWhatsNewForVersion(currentVersion)
  }

  return null
}

export async function dismissWhatsNew(version: string): Promise<void> {
  await saveLastSeenVersion(version || app.getVersion())
}
