import './threadpool'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon-dark.png?asset'
import { registerIpcHandlers } from './ipc/handlers'
import {
  loadThemeSource,
  loadWindowState,
  loadZoomFactor,
  saveWindowState,
  saveZoomFactor
} from './settings'
import { testKnobs } from './testKnobs'
import { IpcChannels } from '../shared/ipc-channels'
import type { DownloadManager } from './download/downloadManager'
import { startExtensionBridge, stopExtensionBridge } from './bridge/extensionBridge'
import { initTray, type TrayController } from './tray'

// In dev mode the app runs as the raw `electron` binary, which otherwise shows "Electron" in
// the Dock tooltip/menu bar — must be set before the app is ready. Packaged builds already get
// this from electron-builder's productName, but setting it here keeps dev and packaged in sync.
app.setName('UnCapped')

// Each e2e test runs against its own throwaway userData folder (downloads, manifests, settings).
if (testKnobs.userDataDir) app.setPath('userData', testKnobs.userDataDir)

process.on('uncaughtException', (err: unknown) => {
  const stack = err instanceof Error ? err.stack || err.message : String(err)
  if (
    stack.includes('webtorrent') ||
    stack.includes('ut_metadata') ||
    stack.includes('bittorrent')
  ) {
    console.warn('[WebTorrent background warning]:', err instanceof Error ? err.message : err)
    return
  }
  console.error('[Uncaught Exception]:', err)
})

process.on('unhandledRejection', (reason: unknown) => {
  const stack = reason instanceof Error ? reason.stack || reason.message : String(reason)
  if (
    stack.includes('webtorrent') ||
    stack.includes('ut_metadata') ||
    stack.includes('bittorrent')
  ) {
    console.warn(
      '[WebTorrent background rejection]:',
      reason instanceof Error ? reason.message : reason
    )
    return
  }
  console.error('[Unhandled Rejection]:', reason)
})

let mainWindow: BrowserWindow | null = null
let downloadManager: DownloadManager | null = null
let trayController: TrayController | null = null
let isQuitting = false
let quitAfterSuspending = false

// Only wired in dev — mirrors the default Electron menu (app/edit/view/window) plus one item to
// toggle the renderer's floating simulate-download panel, which itself only renders in dev.
function installDevMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      {
        label: 'Developer',
        submenu: [
          {
            label: 'Toggle Dev Tools Panel',
            accelerator: 'CmdOrCtrl+Shift+D',
            click: () => mainWindow?.webContents.send(IpcChannels.toggleDevToolsPanel)
          }
        ]
      }
    ])
  )
}

async function createWindow(): Promise<void> {
  const savedState = await loadWindowState()
  const width = savedState.width && savedState.width >= 620 ? savedState.width : 760
  const height = savedState.height && savedState.height >= 420 ? savedState.height : 560

  mainWindow = new BrowserWindow({
    width,
    height,
    x: savedState.x,
    y: savedState.y,
    minWidth: 620,
    minHeight: 420,
    show: false,
    autoHideMenuBar: true,
    title: 'UnCapped',
    // Matches the renderer's dark-mode background so a live window resize
    // (which briefly exposes the raw window background) doesn't flash white.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff',
    ...(process.platform !== 'darwin' ? { icon } : {}),
    // Design v2 draws its own logo + status readout where the title normally sits — on macOS,
    // keep the real traffic lights (still native, still draggable) but let the renderer's own
    // title bar occupy the rest of the strip instead of an OS-drawn title.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // A hidden e2e window would otherwise have its timers throttled.
      backgroundThrottling: !testKnobs.hideWindow
    }
  })

  const initialZoom = await loadZoomFactor()
  let currentZoom = initialZoom

  mainWindow.webContents.setZoomFactor(initialZoom)

  const setZoom = (factor: number): void => {
    if (!mainWindow) return
    currentZoom = Math.max(0.5, Math.min(2.0, Math.round(factor * 100) / 100))
    mainWindow.webContents.setZoomFactor(currentZoom)
    void saveZoomFactor(currentZoom)
    mainWindow.webContents.send(IpcChannels.zoomChanged, currentZoom)
  }

  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow) {
      mainWindow.webContents.setZoomFactor(currentZoom)
      mainWindow.webContents.send(IpcChannels.zoomChanged, currentZoom)
    }
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const isCtrlOrCmd = process.platform === 'darwin' ? input.meta : input.control
    if (!isCtrlOrCmd) return

    if (
      input.key === '+' ||
      input.key === '=' ||
      input.code === 'NumpadAdd' ||
      input.key === 'Add'
    ) {
      event.preventDefault()
      setZoom(currentZoom + 0.1)
    } else if (
      input.key === '-' ||
      input.key === '_' ||
      input.code === 'NumpadSubtract' ||
      input.key === 'Subtract'
    ) {
      event.preventDefault()
      setZoom(currentZoom - 0.1)
    } else if (input.key === '0' || input.code === 'Numpad0') {
      event.preventDefault()
      setZoom(1.0)
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (savedState.isFullScreen) {
      mainWindow?.setFullScreen(true)
    } else if (savedState.isMaximized) {
      mainWindow?.maximize()
    }
    if (!testKnobs.hideWindow) mainWindow?.show()
  })

  let saveTimer: NodeJS.Timeout | null = null
  const recordWindowState = (immediate = false): void => {
    if (!mainWindow) return
    const isFullScreen = mainWindow.isFullScreen()
    const isMaximized = mainWindow.isMaximized()
    const normalBounds = mainWindow.isNormal()
      ? mainWindow.getBounds()
      : mainWindow.getNormalBounds
        ? mainWindow.getNormalBounds()
        : mainWindow.getBounds()

    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }

    const stateToSave = {
      isFullScreen,
      isMaximized,
      width: normalBounds.width,
      height: normalBounds.height,
      x: normalBounds.x,
      y: normalBounds.y
    }

    if (immediate) {
      void saveWindowState(stateToSave)
    } else {
      saveTimer = setTimeout(() => {
        saveTimer = null
        void saveWindowState(stateToSave)
      }, 300)
    }
  }

  mainWindow.on('close', (event) => {
    recordWindowState(true)
    if (!isQuitting && downloadManager?.hasActiveDownload()) {
      event.preventDefault()
      mainWindow?.hide()
      trayController?.notifyMinimizedToTray()
      return
    }
  })
  mainWindow.on('resize', () => recordWindowState(false))
  mainWindow.on('move', () => recordWindowState(false))
  mainWindow.on('maximize', () => recordWindowState(true))
  mainWindow.on('unmaximize', () => recordWindowState(true))
  mainWindow.on('enter-full-screen', () => recordWindowState(true))
  mainWindow.on('leave-full-screen', () => recordWindowState(true))

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Only hand http(s) links to the OS shell — an arbitrary scheme (e.g. a custom protocol
    // handler) reaching shell.openExternal is a known Electron risk if this ever fires with
    // attacker- or server-influenced data.
    if (/^https?:/i.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.uncapped.app')

  // Applied before the window is created so the initial background/icon already match —
  // the saved preference otherwise only takes effect on the next 'updated' event.
  nativeTheme.themeSource = await loadThemeSource()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  downloadManager = registerIpcHandlers(() => mainWindow)
  startExtensionBridge(downloadManager, () => mainWindow)
  trayController = initTray(() => mainWindow, downloadManager)
  downloadManager.setOnUpdate((state) => {
    trayController?.updateTray(state)
  })

  nativeTheme.on('updated', () => {
    mainWindow?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff')
  })

  if (is.dev) installDevMenu()

  await createWindow()
  if (testKnobs.hideWindow) app.dock?.hide()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('before-quit', (event) => {
  isQuitting = true
  trayController?.destroy()
  stopExtensionBridge()
  if (quitAfterSuspending || !downloadManager) return

  event.preventDefault()
  void downloadManager.suspendAll().finally(() => {
    quitAfterSuspending = true
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!downloadManager?.hasActiveDownload()) {
      app.quit()
    }
  }
})
