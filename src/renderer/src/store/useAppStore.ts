import type {
  DownloadState,
  DownloadStatus,
  NetworkInterfaceInfo,
  NetworkPreference,
  NetworkPreferences,
  ThemeSource,
  UpdateInfo,
  UpdateProgress,
  WhatsNewItem
} from '@shared/types'
import { create } from 'zustand'
import { groupChunksByInterface } from '../utils/format'
import { toast } from './useToastStore'

export function applyTheme(theme: ThemeSource): void {
  try {
    localStorage.setItem('uncapped_theme', theme)
  } catch {
    // ignore
  }
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
    root.classList.remove('light')
    root.setAttribute('data-theme', 'dark')
  } else {
    root.classList.add('light')
    root.classList.remove('dark')
    root.setAttribute('data-theme', 'light')
  }
}

function getInitialTheme(): ThemeSource {
  try {
    const saved = localStorage.getItem('uncapped_theme')
    if (saved === 'dark' || saved === 'light') {
      applyTheme(saved)
      return saved
    }
  } catch {
    // ignore
  }
  return 'light'
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface SpeedTestResult {
  timestamp: number
  totalBytes: number
  durationMs: number
  peakSpeedBytesPerSec: number
  averageSpeedBytesPerSec: number
  interfaces: {
    id: string
    name: string
    kind: string
    bytesDownloaded: number
    speedBytesPerSec: number
  }[]
}

const SPEED_HISTORY_LENGTH = 60
const SPEED_SAMPLE_INTERVAL_MS = 1000
const DOWNLOAD_HISTORY_KEY = 'uncapped:download_history'
const LEGACY_DOWNLOAD_HISTORY_KEY = 'uncapped:download_history'
const SPEED_TEST_RESULT_KEY = 'uncapped:last_speed_test'
const LEGACY_SPEED_TEST_RESULT_KEY = 'uncapped:last_speed_test'

function loadSavedSpeedTestResult(): SpeedTestResult | null {
  try {
    const raw =
      localStorage.getItem(SPEED_TEST_RESULT_KEY) ||
      localStorage.getItem(LEGACY_SPEED_TEST_RESULT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SpeedTestResult
  } catch {
    return null
  }
}

function persistSpeedTestResult(result: SpeedTestResult | null): void {
  try {
    if (result) {
      localStorage.setItem(SPEED_TEST_RESULT_KEY, JSON.stringify(result))
    } else {
      localStorage.removeItem(SPEED_TEST_RESULT_KEY)
    }
  } catch {
    // ignore
  }
}

function loadSavedDownloads(): DownloadState[] {
  try {
    const raw =
      localStorage.getItem(DOWNLOAD_HISTORY_KEY) ||
      localStorage.getItem(LEGACY_DOWNLOAD_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Exclude speed test files from persistent fileList and clean up any disk files
    const filtered = parsed.filter((item) => {
      const isSpeed =
        item.fileName?.startsWith('UnCapped-SpeedTest-') ||
        item.fileName?.startsWith('UnCapped-SpeedTest-')
      if (isSpeed && item.destinationPath) {
        void window.uncapped?.deleteDownload(item.id, item.destinationPath, true)
      }
      return !isSpeed
    })
    persistDownloads(filtered)
    return filtered
  } catch {
    return []
  }
}

function persistDownloads(downloads: DownloadState[]): void {
  try {
    localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(downloads))
  } catch {
    // ignore
  }
}

// Tracks downloads explicitly deleted so lagging IPC update events do not resurrect them in the UI.
const deletedDownloadIds = new Set<string>()

// Throttling cadence lives outside the store's own state — it's bookkeeping for how often to
// sample, not something a component should ever read or re-render on.
let lastSpeedSampleAt = 0

interface AppStore {
  interfaces: NetworkInterfaceInfo[]
  interfacesStatus: LoadStatus
  interfacesError: string | null
  latencies: Record<string, number | null>
  /** User customizations (name/color) per network interface id — persisted in the main process. */
  networkPreferences: NetworkPreferences

  /** Persisted in the main process alongside nativeTheme.themeSource. */
  themeSource: ThemeSource

  /** Null until the one-time startup check resolves, or if it found nothing worth showing
   * (already up to date, already dismissed, or the check failed). */
  availableUpdate: UpdateInfo | null

  homeDir: string
  downloadsDir: string
  pathsStatus: LoadStatus
  /** True in electron-vite's dev server, false in a packaged build — gates the dev tools panel. */
  isDev: boolean

  /** Current UI view: 'list' (files table), 'detail' (complete download screen), or 'idle' (new download) */
  activeView: 'list' | 'detail' | 'idle'
  selectedDownload: DownloadState | null
  fileList: DownloadState[]
  lastSpeedTestResult: SpeedTestResult | null
  clearLastSpeedTestResult: () => void
  setActiveView: (view: 'list' | 'detail' | 'idle') => void
  setSelectedDownload: (download: DownloadState | null) => void
  selectDownloadForDetail: (download: DownloadState) => void
  cancelAndRedirectToList: (id: string) => void
  removeDownloadFromList: (id: string) => void
  updateDownloadStatus: (id: string, status: DownloadStatus) => void

  /** UnCapped focuses on one download at a time — this is it. */
  currentDownload: DownloadState | null
  speedHistory: number[]
  /** Same rolling window as speedHistory, split by physical network — for the stacked
   * per-network throughput chart, keyed by interface id. */
  speedHistoryByInterface: Record<string, number[]>
  /** Highest combined speed seen so far this download — a rolling history window would lose it
   * once it ages out, so this is tracked as a running max instead. */
  peakSpeedBytesPerSec: number

  /** Lifted out of the Idle screen so it survives a swap to/from the No-connections screen. */
  draftUrl: string
  draftDestinationDir: string

  loadInterfaces: () => Promise<void>
  refreshLatencies: () => Promise<void>
  loadInitialPaths: () => Promise<void>
  loadNetworkPreferences: () => Promise<void>
  setNetworkPreference: (id: string, patch: NetworkPreference) => Promise<void>
  loadThemeSource: () => Promise<void>
  setThemeSource: (source: ThemeSource) => Promise<void>
  checkForUpdate: () => Promise<void>
  dismissUpdate: () => void
  setCurrentDownload: (state: DownloadState) => void
  clearCurrentDownload: () => void
  setDraftUrl: (url: string) => void
  setDraftDestinationDir: (dir: string) => void
  latencyShieldEnabled: boolean
  toggleLatencyShield: () => Promise<void>
  zoomFactor: number
  loadZoomFactor: () => Promise<void>
  setZoomFactor: (factor: number) => Promise<void>
  appUpdateStatus: 'idle' | 'downloading' | 'ready' | 'error'
  updateProgress: UpdateProgress | null
  whatsNew: WhatsNewItem | null
  startUpdateDownload: () => Promise<void>
  installUpdateAndRestart: () => void
  checkWhatsNew: () => Promise<void>
  dismissWhatsNew: () => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  interfaces: [],
  interfacesStatus: 'idle',
  interfacesError: null,
  latencies: {},
  networkPreferences: {},
  themeSource: getInitialTheme(),
  availableUpdate: null,

  homeDir: '',
  downloadsDir: '',
  pathsStatus: 'idle',
  isDev: false,

  activeView: 'idle',
  latencyShieldEnabled: false,
  zoomFactor: 1.0,
  appUpdateStatus: 'idle',
  updateProgress: null,
  whatsNew: null,
  toggleLatencyShield: async () => {
    const next = !get().latencyShieldEnabled
    set({ latencyShieldEnabled: next })
    if (next) {
      toast.info(
        'Latency Shield Enabled',
        'Packet smoothing active to preserve low gaming & stream ping'
      )
    } else {
      toast.info('Latency Shield Disabled', 'Operating at full unconstrained bandwidth')
    }
    try {
      const res = await window.uncapped.setLatencyShield(next)
      set({ latencyShieldEnabled: res })
    } catch {
      // ignore
    }
  },
  selectedDownload: null,
  fileList: loadSavedDownloads(),
  lastSpeedTestResult: loadSavedSpeedTestResult(),
  clearLastSpeedTestResult: () => {
    persistSpeedTestResult(null)
    set({ lastSpeedTestResult: null })
  },
  setActiveView: (activeView) => set({ activeView }),
  setSelectedDownload: (selectedDownload) => set({ selectedDownload }),
  selectDownloadForDetail: (download) => {
    const isCurrent = get().currentDownload?.id === download.id
    set({
      selectedDownload: download,
      currentDownload: download,
      speedHistory: isCurrent ? get().speedHistory : [download.speedBytesPerSec],
      peakSpeedBytesPerSec: isCurrent ? get().peakSpeedBytesPerSec : download.speedBytesPerSec,
      activeView: 'detail'
    })
  },
  cancelAndRedirectToList: (id) => {
    deletedDownloadIds.delete(id)
    let nextFileList = get().fileList.map((item) =>
      item.id === id ? { ...item, status: 'cancelled' as const, speedBytesPerSec: 0 } : item
    )
    if (!nextFileList.some((item) => item.id === id) && get().currentDownload) {
      nextFileList = [
        { ...get().currentDownload!, status: 'cancelled' as const, speedBytesPerSec: 0 },
        ...nextFileList
      ]
    }
    persistDownloads(nextFileList)
    set({
      fileList: nextFileList,
      activeView: 'list',
      currentDownload: null,
      selectedDownload: null
    })
  },
  removeDownloadFromList: (id) => {
    deletedDownloadIds.add(id)
    const nextFileList = get().fileList.filter((item) => item.id !== id)
    persistDownloads(nextFileList)
    set({
      fileList: nextFileList,
      currentDownload: get().currentDownload?.id === id ? null : get().currentDownload,
      selectedDownload: get().selectedDownload?.id === id ? null : get().selectedDownload
    })
    void window.uncapped.removeDownload(id).catch(() => {})
  },
  updateDownloadStatus: (id, status) => {
    const nextFileList = get().fileList.map((item) =>
      item.id === id
        ? {
            ...item,
            status,
            speedBytesPerSec:
              status === 'paused' || status === 'completed' ? 0 : item.speedBytesPerSec
          }
        : item
    )
    persistDownloads(nextFileList)
    set({ fileList: nextFileList })
  },

  currentDownload: null,
  speedHistory: [],
  speedHistoryByInterface: {},
  peakSpeedBytesPerSec: 0,

  draftUrl: '',
  draftDestinationDir: '',

  loadInterfaces: async () => {
    // A re-scan keeps showing the last result. Dropping back to 'loading' would swap App off the
    // no-connections screen, and every screen re-scans on mount — so with zero networks the
    // two screens would remount each other in an endless loop.
    if (get().interfacesStatus !== 'ready') set({ interfacesStatus: 'loading' })
    set({ interfacesError: null })
    const previous = get().interfaces
    const wasReady = get().interfacesStatus === 'ready'
    try {
      const interfaces = await window.uncapped.listInterfaces()
      if (wasReady && previous.length > 0) {
        const prevIds = new Set(previous.map((i) => i.id))
        const nextIds = new Set(interfaces.map((i) => i.id))
        const added = interfaces.filter((i) => !prevIds.has(i.id))
        const removed = previous.filter((i) => !nextIds.has(i.id))
        for (const iface of added) {
          toast.network(
            'Network Connected',
            `${iface.displayName} is now bonded and active`,
            iface.kind
          )
        }
        for (const iface of removed) {
          toast.warning('Network Disconnected', `${iface.displayName} was removed`)
        }
      }
      set({ interfaces, interfacesStatus: 'ready' })
    } catch (error) {
      set({
        interfacesStatus: 'error',
        interfacesError: error instanceof Error ? error.message : String(error)
      })
    }
  },

  refreshLatencies: async () => {
    try {
      const latencies = await window.uncapped.pingInterfaces()
      set({ latencies })
    } catch {
      // Latency is a nice-to-have readout — a failed probe just leaves stale values.
    }
  },

  loadInitialPaths: async () => {
    set({ pathsStatus: 'loading' })
    try {
      const { homeDir, downloadsDir, isDev } = await window.uncapped.getInitialPaths()
      set((state) => ({
        homeDir,
        downloadsDir,
        draftDestinationDir: state.draftDestinationDir || downloadsDir,
        isDev,
        pathsStatus: 'ready'
      }))
    } catch {
      set({ pathsStatus: 'error' })
    }
  },

  loadNetworkPreferences: async () => {
    try {
      const networkPreferences = await window.uncapped.getNetworkPreferences()
      set({ networkPreferences })
    } catch {
      // Best-effort — a failed read just leaves networks under their OS names/default colors.
    }
  },

  setNetworkPreference: async (id, patch) => {
    // Optimistic update so the rename/recolor feels instant — the IPC round trip resolves
    // (or, on failure, quietly leaves the optimistic value as the source of truth for now).
    set((state) => ({
      networkPreferences: {
        ...state.networkPreferences,
        [id]: { ...state.networkPreferences[id], ...patch }
      }
    }))
    try {
      const networkPreferences = await window.uncapped.setNetworkPreference(id, patch)
      set({ networkPreferences })
    } catch {
      // Leave the optimistic value in place — not persisted to disk, but still usable this session.
    }
  },

  loadThemeSource: async () => {
    try {
      const themeSource = await window.uncapped.getThemeSource()
      applyTheme(themeSource)
      set({ themeSource })
    } catch {
      // Best-effort — a failed read just leaves the toggle showing the current state.
    }
  },

  setThemeSource: async (themeSource) => {
    // Optimistic update, same as setNetworkPreference — the toggle should feel instant.
    applyTheme(themeSource)
    set({ themeSource })
    try {
      await window.uncapped.setThemeSource(themeSource)
    } catch {
      // Leave the optimistic value in place — not persisted to disk, but still usable this session.
    }
  },

  loadZoomFactor: async () => {
    try {
      const zoomFactor = await window.uncapped.getZoomFactor()
      set({ zoomFactor })
    } catch {
      // Best-effort
    }
  },

  setZoomFactor: async (factor: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, Math.round(factor * 100) / 100))
    set({ zoomFactor: clamped })
    try {
      await window.uncapped.setZoomFactor(clamped)
    } catch {
      // Leave optimistic value
    }
  },

  checkForUpdate: async () => {
    try {
      const availableUpdate = await window.uncapped.checkForUpdate()
      set({ availableUpdate })
    } catch {
      // Best-effort — a failed check just leaves the banner hidden.
    }
  },

  dismissUpdate: () => {
    const update = get().availableUpdate
    if (!update) return
    // Keeps the update visible as a quiet titlebar icon rather than clearing it outright.
    set({ availableUpdate: { ...update, dismissed: true } })
    void window.uncapped.dismissUpdate(update.version)
  },

  startUpdateDownload: async () => {
    set({
      appUpdateStatus: 'downloading',
      updateProgress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 }
    })
    try {
      const ok = await window.uncapped.startUpdateDownload()
      if (!ok) {
        set({ appUpdateStatus: 'error' })
      }
    } catch {
      set({ appUpdateStatus: 'error' })
    }
  },

  installUpdateAndRestart: () => {
    void window.uncapped.installUpdateAndRestart()
  },

  checkWhatsNew: async () => {
    try {
      const whatsNew = await window.uncapped.getWhatsNew()
      if (whatsNew) {
        set({ whatsNew })
      }
    } catch {
      // Best-effort
    }
  },

  dismissWhatsNew: () => {
    const item = get().whatsNew
    set({ whatsNew: null })
    if (item?.version) {
      void window.uncapped.dismissWhatsNew(item.version)
    }
  },

  setCurrentDownload: (download) => {
    const previous = get().currentDownload
    const isNewDownload = !previous || previous.id !== download.id

    let speedHistory = isNewDownload ? [] : get().speedHistory
    let speedHistoryByInterface = isNewDownload ? {} : get().speedHistoryByInterface
    let peakSpeedBytesPerSec = isNewDownload ? 0 : get().peakSpeedBytesPerSec
    if (isNewDownload) lastSpeedSampleAt = 0

    if (download.status === 'downloading') {
      peakSpeedBytesPerSec = Math.max(peakSpeedBytesPerSec, download.speedBytesPerSec)

      const now = Date.now()
      if (now - lastSpeedSampleAt >= SPEED_SAMPLE_INTERVAL_MS) {
        lastSpeedSampleAt = now
        speedHistory = [...speedHistory, download.speedBytesPerSec].slice(-SPEED_HISTORY_LENGTH)

        const nextByInterface: Record<string, number[]> = {}
        for (const group of groupChunksByInterface(download.chunks)) {
          const previousSeries = speedHistoryByInterface[group.interfaceId] ?? []
          nextByInterface[group.interfaceId] = [...previousSeries, group.speedBytesPerSec].slice(
            -SPEED_HISTORY_LENGTH
          )
        }
        speedHistoryByInterface = nextByInterface
      }
    }

    if (download.latencyShieldEnabled !== undefined) {
      set({ latencyShieldEnabled: download.latencyShieldEnabled })
    }

    const isSpeedTest =
      download.fileName.startsWith('UnCapped-SpeedTest-') ||
      download.fileName.startsWith('UnCapped-SpeedTest-')

    if (download.status === 'completed' && isSpeedTest) {
      const durationMs = Math.max(
        500,
        (download.completedAt || Date.now()) - download.startedAt - (download.totalPausedMs || 0)
      )
      const averageSpeedBytesPerSec = Math.round((download.bytesDownloaded / durationMs) * 1000)
      const peakSpeedBytesPerSec = Math.max(
        get().peakSpeedBytesPerSec,
        download.speedBytesPerSec,
        averageSpeedBytesPerSec
      )

      const interfaceGroups = groupChunksByInterface(download.chunks)
      const interfacesSummary = interfaceGroups.map((g) => ({
        id: g.interfaceId,
        name: g.interfaceLabel,
        kind: g.interfaceKind,
        bytesDownloaded: g.bytesDownloaded,
        speedBytesPerSec: g.speedBytesPerSec
      }))

      const result: SpeedTestResult = {
        timestamp: Date.now(),
        totalBytes: download.bytesDownloaded,
        durationMs,
        peakSpeedBytesPerSec,
        averageSpeedBytesPerSec,
        interfaces: interfacesSummary
      }

      persistSpeedTestResult(result)

      // Automatically remove the temporary speed test file permanently from disk and manager
      void window.uncapped.deleteDownload(download.id, download.destinationPath, true)

      set({ lastSpeedTestResult: result })
    }

    if (
      !isSpeedTest &&
      previous &&
      previous.id === download.id &&
      previous.status !== 'completed' &&
      download.status === 'completed'
    ) {
      toast.success('Download Complete', download.fileName, {
        label: 'Open Folder',
        onClick: () => {
          if (download.destinationPath) {
            void window.uncapped.revealInFolder(download.destinationPath)
          }
        }
      })
    }

    if (deletedDownloadIds.has(download.id)) {
      return
    }

    if (!isSpeedTest) {
      const existingIndex = get().fileList.findIndex(
        (item) => item.id === download.id || item.fileName === download.fileName
      )
      if (existingIndex < 0 && download.status === 'cancelled') {
        return
      }

      const nextFileList = [...get().fileList]
      if (existingIndex >= 0) {
        nextFileList[existingIndex] = { ...nextFileList[existingIndex], ...download }
      } else {
        nextFileList.unshift(download)
      }
      persistDownloads(nextFileList)

      set({
        currentDownload: download,
        selectedDownload:
          get().selectedDownload?.id === download.id ? download : get().selectedDownload,
        fileList: nextFileList,
        speedHistory,
        speedHistoryByInterface,
        peakSpeedBytesPerSec
      })
    } else {
      set({
        currentDownload: download,
        selectedDownload:
          get().selectedDownload?.id === download.id ? download : get().selectedDownload,
        speedHistory,
        speedHistoryByInterface,
        peakSpeedBytesPerSec
      })
    }
  },

  clearCurrentDownload: () =>
    set({
      currentDownload: null,
      selectedDownload: null,
      speedHistory: [],
      speedHistoryByInterface: {},
      peakSpeedBytesPerSec: 0,
      activeView: 'idle'
    }),

  setDraftUrl: (draftUrl) => set({ draftUrl }),
  setDraftDestinationDir: (draftDestinationDir) => set({ draftDestinationDir })
}))
