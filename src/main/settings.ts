import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, nativeTheme } from 'electron'
import type { ThemeSource } from '../shared/types'

function settingsPath(): string {
  return join(app.getPath('userData'), 'app-settings.json')
}

interface AppSettings {
  themeSource?: ThemeSource
  dismissedUpdateVersion?: string
  lastDownloadDir?: string
  windowState?: WindowModeSettings
  zoomFactor?: number
  lastSeenVersion?: string
}

export interface WindowModeSettings {
  isFullScreen?: boolean
  isMaximized?: boolean
  width?: number
  height?: number
  x?: number
  y?: number
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf-8')
    return JSON.parse(raw) as AppSettings
  } catch {
    // No file yet (first run) or it's unreadable/corrupt — either way, no saved settings.
    return {}
  }
}

export async function loadThemeSource(): Promise<ThemeSource> {
  const settings = await loadSettings()
  if (settings.themeSource === 'light' || settings.themeSource === 'dark') {
    return settings.themeSource
  }
  // First run, or a pre-existing settings file from when 'system' was an option — fall back to
  // whatever the OS appearance is right now rather than defaulting to a fixed theme.
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

export async function saveThemeSource(themeSource: ThemeSource): Promise<void> {
  const settings = await loadSettings()
  await writeFile(settingsPath(), JSON.stringify({ ...settings, themeSource }, null, 2), 'utf-8')
}

export async function loadDismissedUpdateVersion(): Promise<string | undefined> {
  const settings = await loadSettings()
  return settings.dismissedUpdateVersion
}

export async function saveDismissedUpdateVersion(version: string): Promise<void> {
  const settings = await loadSettings()
  await writeFile(
    settingsPath(),
    JSON.stringify({ ...settings, dismissedUpdateVersion: version }, null, 2),
    'utf-8'
  )
}

export async function loadLastDownloadDir(): Promise<string | undefined> {
  const settings = await loadSettings()
  return settings.lastDownloadDir
}

export async function saveLastDownloadDir(dir: string): Promise<void> {
  if (!dir) return
  const settings = await loadSettings()
  await writeFile(
    settingsPath(),
    JSON.stringify({ ...settings, lastDownloadDir: dir }, null, 2),
    'utf-8'
  )
}

export async function loadWindowState(): Promise<WindowModeSettings> {
  const settings = await loadSettings()
  return settings.windowState || {}
}

export async function saveWindowState(state: WindowModeSettings): Promise<void> {
  const settings = await loadSettings()
  await writeFile(
    settingsPath(),
    JSON.stringify({ ...settings, windowState: state }, null, 2),
    'utf-8'
  )
}

export async function loadZoomFactor(): Promise<number> {
  const settings = await loadSettings()
  if (typeof settings.zoomFactor === 'number' && Number.isFinite(settings.zoomFactor)) {
    return Math.max(0.5, Math.min(2.0, Math.round(settings.zoomFactor * 100) / 100))
  }
  return 1.0
}

export async function saveZoomFactor(zoomFactor: number): Promise<void> {
  const clamped = Math.max(0.5, Math.min(2.0, Math.round(zoomFactor * 100) / 100))
  const settings = await loadSettings()
  await writeFile(
    settingsPath(),
    JSON.stringify({ ...settings, zoomFactor: clamped }, null, 2),
    'utf-8'
  )
}

export async function loadLastSeenVersion(): Promise<string | undefined> {
  const settings = await loadSettings()
  return settings.lastSeenVersion
}

export async function saveLastSeenVersion(version: string): Promise<void> {
  const settings = await loadSettings()
  await writeFile(
    settingsPath(),
    JSON.stringify({ ...settings, lastSeenVersion: version }, null, 2),
    'utf-8'
  )
}
