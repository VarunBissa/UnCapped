import { app, BrowserWindow, Menu, nativeImage, Notification, Tray } from 'electron'
import iconAsset from '../../resources/icon-dark.png?asset'
import type { DownloadManager } from './download/downloadManager'
import type { DownloadState } from '../shared/types'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

export interface TrayController {
  updateTray: (downloadState?: DownloadState | null) => void
  notifyMinimizedToTray: () => void
  destroy: () => void
}

export function initTray(
  getWindow: () => BrowserWindow | null,
  downloadManager: DownloadManager
): TrayController {
  let tray: Tray | null = null

  try {
    let img = nativeImage.createFromPath(iconAsset)
    if (img.isEmpty()) {
      img = nativeImage.createEmpty()
    }
    const trayIcon = img.resize({ width: 16, height: 16 })
    tray = new Tray(trayIcon)
  } catch (err) {
    console.warn('[Tray] Failed to create system tray icon:', err)
    return {
      updateTray: () => {},
      notifyMinimizedToTray: () => {},
      destroy: () => {}
    }
  }

  const showWindow = (): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  }

  tray.setToolTip('UnCapped - Multi-Network Downloader')

  tray.on('click', () => {
    showWindow()
  })

  tray.on('double-click', () => {
    showWindow()
  })

  const updateTray = (stateOverride?: DownloadState | null): void => {
    if (!tray || tray.isDestroyed()) return

    const current = stateOverride !== undefined ? stateOverride : null // async fallback handled when needed

    const isLatencyShield = downloadManager.getLatencyShield()

    if (current && (current.status === 'downloading' || current.status === 'assembling')) {
      const speed = current.speedBytesPerSec || 0
      const total = current.totalBytes || 0
      const downloaded = current.bytesDownloaded || 0
      const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0
      const fileLabel =
        current.fileName.length > 28 ? `${current.fileName.slice(0, 25)}…` : current.fileName

      const speedLabel =
        current.status === 'assembling' ? 'Assembling file…' : `${formatSpeed(speed)} (${percent}%)`
      const tooltip = `UnCapped: ${speedLabel} - ${fileLabel}`
      tray.setToolTip(tooltip.slice(0, 127))

      const contextMenu = Menu.buildFromTemplate([
        { label: `UnCapped: ${fileLabel}`, enabled: false },
        { label: speedLabel, enabled: false },
        { type: 'separator' },
        {
          label: 'Open UnCapped',
          click: () => showWindow()
        },
        {
          label: 'Pause Download',
          click: () => void downloadManager.pause(current.id)
        },
        {
          label: `Gaming / Latency Shield: ${isLatencyShield ? 'ON 🛡️' : 'OFF'}`,
          click: async () => {
            await downloadManager.setLatencyShield(!isLatencyShield)
            updateTray()
          }
        },
        { type: 'separator' },
        {
          label: 'Quit UnCapped',
          click: () => {
            app.quit()
          }
        }
      ])
      tray.setContextMenu(contextMenu)
    } else if (current && current.status === 'paused') {
      const fileLabel =
        current.fileName.length > 28 ? `${current.fileName.slice(0, 25)}…` : current.fileName
      tray.setToolTip(`UnCapped - Paused (${fileLabel})`.slice(0, 127))

      const contextMenu = Menu.buildFromTemplate([
        { label: `Paused: ${fileLabel}`, enabled: false },
        { type: 'separator' },
        {
          label: 'Open UnCapped',
          click: () => showWindow()
        },
        {
          label: 'Resume Download',
          click: () => downloadManager.resume(current.id)
        },
        {
          label: `Gaming / Latency Shield: ${isLatencyShield ? 'ON 🛡️' : 'OFF'}`,
          click: async () => {
            await downloadManager.setLatencyShield(!isLatencyShield)
            updateTray()
          }
        },
        { type: 'separator' },
        {
          label: 'Quit UnCapped',
          click: () => {
            app.quit()
          }
        }
      ])
      tray.setContextMenu(contextMenu)
    } else {
      tray.setToolTip('UnCapped - Multi-Network Downloader')

      const contextMenu = Menu.buildFromTemplate([
        { label: 'UnCapped: Idle', enabled: false },
        { type: 'separator' },
        {
          label: 'Open UnCapped',
          click: () => showWindow()
        },
        {
          label: `Gaming / Latency Shield: ${isLatencyShield ? 'ON 🛡️' : 'OFF'}`,
          click: async () => {
            await downloadManager.setLatencyShield(!isLatencyShield)
            updateTray()
          }
        },
        { type: 'separator' },
        {
          label: 'Quit UnCapped',
          click: () => {
            app.quit()
          }
        }
      ])
      tray.setContextMenu(contextMenu)
    }
  }

  updateTray(null)

  let lastNotifiedAt = 0
  const notifyMinimizedToTray = (): void => {
    const now = Date.now()
    if (now - lastNotifiedAt < 10000) return
    lastNotifiedAt = now

    if (Notification.isSupported()) {
      try {
        const notif = new Notification({
          title: 'UnCapped is downloading in the background',
          body: 'Transfer continues seamlessly. Click tray icon to open.'
        })
        notif.on('click', showWindow)
        notif.show()
      } catch {
        // best-effort
      }
    }
  }

  return {
    updateTray,
    notifyMinimizedToTray,
    destroy: () => {
      if (tray && !tray.isDestroyed()) {
        tray.destroy()
        tray = null
      }
    }
  }
}
