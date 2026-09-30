import { exec } from 'node:child_process'
import type { BrowserWindow } from 'electron'
import { powerSaveBlocker } from 'electron'
import { IpcChannels } from '../shared/ipc-channels'

let shutdownTimer: NodeJS.Timeout | null = null
let countdownInterval: NodeJS.Timeout | null = null
let currentRemainingSeconds = 0
let currentAction = 'shutdown'
let powerSaveBlockerId: number | null = null

export function acquirePowerSaveBlocker(): void {
  if (powerSaveBlockerId === null || !powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    try {
      powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')
    } catch {
      // Best-effort
    }
  }
}

export function releasePowerSaveBlocker(): void {
  if (powerSaveBlockerId !== null) {
    try {
      if (powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        powerSaveBlocker.stop(powerSaveBlockerId)
      }
    } catch {
      // Best-effort
    }
    powerSaveBlockerId = null
  }
}

export function sleepSystem(): void {
  const platform = process.platform
  if (platform === 'win32') {
    exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0')
  } else if (platform === 'darwin') {
    exec('pmset sleepnow')
  } else if (platform === 'linux') {
    exec('systemctl suspend || pm-suspend')
  }
}

export function startShutdownCountdown(
  getWindow: () => BrowserWindow | null,
  action: 'shutdown' | 'sleep' = 'shutdown',
  seconds = 30
): void {
  cancelShutdown(getWindow)

  currentAction = action
  currentRemainingSeconds = seconds

  const notify = (remaining: number): void => {
    const window = getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(IpcChannels.shutdownCountdown, {
        remainingSeconds: remaining,
        action: currentAction
      })
    }
  }

  notify(currentRemainingSeconds)

  countdownInterval = setInterval(() => {
    currentRemainingSeconds--
    if (currentRemainingSeconds <= 0) {
      if (countdownInterval) clearInterval(countdownInterval)
      countdownInterval = null
    }
    notify(Math.max(0, currentRemainingSeconds))
  }, 1000)

  shutdownTimer = setTimeout(() => {
    cleanupTimers()
    const window = getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(IpcChannels.shutdownCountdown, null)
    }

    if (action === 'sleep') {
      sleepSystem()
      return
    }

    const platform = process.platform
    if (platform === 'win32') {
      exec('shutdown /s /t 0')
    } else if (platform === 'darwin') {
      exec('osascript -e \'tell app "System Events" to shut down\'')
    } else if (platform === 'linux') {
      exec('shutdown -h now || poweroff')
    }
  }, seconds * 1000)
}

function cleanupTimers(): void {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer)
    shutdownTimer = null
  }
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
}

export function cancelShutdown(getWindow?: () => BrowserWindow | null): boolean {
  const wasActive = shutdownTimer !== null || countdownInterval !== null
  cleanupTimers()

  if (process.platform === 'win32') {
    exec('shutdown /a', () => {})
  } else if (process.platform === 'linux') {
    exec('shutdown -c', () => {})
  }

  if (getWindow) {
    const window = getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(IpcChannels.shutdownCountdown, null)
    }
  }

  return wasActive
}
