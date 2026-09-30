const PLEXO_BRIDGE_URL = 'http://127.0.0.1:23851'

// Default configuration settings
const DEFAULT_CONFIG = {
  enabled: true,
  minSizeMB: 0, // 0 = intercept all downloads
  interceptMagnets: true
}

const handledDownloadIds = new Set()
const storage = chrome.storage.session || chrome.storage.local

async function savePendingDownload(id, data) {
  const key = `pending_${id}`
  await storage.set({ [key]: data })
}

async function getPendingDownload(id) {
  const key = `pending_${id}`
  const result = await storage.get([key])
  return result[key] || null
}

async function removePendingDownload(id) {
  const key = `pending_${id}`
  await storage.remove([key])
}

function parsePath(fullPath) {
  if (!fullPath || typeof fullPath !== 'string') {
    return { destinationDir: undefined, fileName: undefined }
  }

  // Handle both Windows (\) and POSIX (/) path separators
  const lastSlash = Math.max(fullPath.lastIndexOf('\\'), fullPath.lastIndexOf('/'))
  if (lastSlash === -1) {
    return { destinationDir: undefined, fileName: fullPath }
  }

  let destinationDir = fullPath.slice(0, lastSlash)
  const fileName = fullPath.slice(lastSlash + 1)

  // Handle Windows root drive like "C:" -> "C:\"
  if (destinationDir.length === 2 && destinationDir[1] === ':') {
    destinationDir += '\\'
  } else if (!destinationDir && (fullPath.startsWith('/') || fullPath.startsWith('\\'))) {
    // POSIX root directory "/"
    destinationDir = '/'
  }

  return { destinationDir, fileName }
}

async function getConfig() {
  const result = await chrome.storage.local.get(['plexoConfig'])
  return { ...DEFAULT_CONFIG, ...(result.plexoConfig || {}) }
}

let lastHealthCheck = 0
let cachedHealth = false

async function isPlexoHealthy() {
  const now = Date.now()
  if (cachedHealth && now - lastHealthCheck < 3000) {
    return true
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1000)
    const res = await fetch(`${PLEXO_BRIDGE_URL}/health`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) {
      cachedHealth = false
      return false
    }
    const data = await res.json()
    cachedHealth = data.status === 'ok' && (data.app === 'UnCapped' || data.app === 'Plexo')
    lastHealthCheck = now
    return cachedHealth
  } catch {
    cachedHealth = false
    return false
  }
}

async function getCookiesForUrl(url) {
  try {
    if (!url || url.startsWith('magnet:') || url.startsWith('blob:') || url.startsWith('data:')) {
      return ''
    }
    const cookies = await chrome.cookies.getAll({ url })
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  } catch {
    return ''
  }
}

async function sendDownloadToPlexo(payload) {
  const res = await fetch(`${PLEXO_BRIDGE_URL}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`UnCapped rejected download: ${errText}`)
  }
  return await res.json()
}

async function handleFinalizedDownload(downloadId, explicitFullPath, inlinePendingData) {
  const pending = inlinePendingData || (await getPendingDownload(downloadId))
  if (!pending) return

  let fullPath = explicitFullPath
  if (!fullPath) {
    try {
      const items = await chrome.downloads.search({ id: downloadId })
      if (items && items[0] && items[0].filename) {
        fullPath = items[0].filename
      }
    } catch {
      // ignore
    }
  }

  // If no filename is finalized yet, wait for subsequent event
  if (!fullPath) return

  // Remove from pending so we don't process again
  await removePendingDownload(downloadId)

  // Prevent duplicate handling across events
  if (handledDownloadIds.has(downloadId)) return
  handledDownloadIds.add(downloadId)

  if (handledDownloadIds.size > 200) {
    const oldest = handledDownloadIds.values().next().value
    handledDownloadIds.delete(oldest)
  }

  const { destinationDir, fileName } = parsePath(fullPath)

  try {
    const result = await sendDownloadToPlexo({
      url: pending.url,
      fileName: fileName || pending.fileName,
      destinationDir,
      referrer: pending.referrer,
      cookies: pending.cookies,
      totalBytes: pending.totalBytes
    })

    // If UnCapped accepted the download, cancel Chrome's download cleanly
    if (result && result.success) {
      try {
        await chrome.downloads.cancel(downloadId)
        await chrome.downloads.erase({ id: downloadId })
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.warn('[UnCapped] Could not hand over to UnCapped, continuing in Chrome:', err)
  }
}

// Respond to popup status queries
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CHECK_HEALTH') {
    isPlexoHealthy().then((online) => {
      sendResponse({ online })
    })
    return true // Keep channel open for async response
  }
  return false
})

// Intercept browser downloads: wait for filename determination / Save As dialog
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  // Prevent duplicate triggers
  if (handledDownloadIds.has(downloadItem.id)) return

  // Ignore historical downloads (older than 15 seconds) or already complete/interrupted items
  if (downloadItem.state && downloadItem.state !== 'in_progress') return
  if (downloadItem.startTime && Date.now() - new Date(downloadItem.startTime).getTime() > 15000) {
    return
  }

  const config = await getConfig()
  if (!config.enabled) return

  const url = downloadItem.finalUrl || downloadItem.url
  if (!url || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('magnet:')) {
    return
  }

  // Filter out tiny files if user configured a threshold
  if (config.minSizeMB > 0 && downloadItem.totalBytes > 0) {
    const sizeInMB = downloadItem.totalBytes / (1024 * 1024)
    if (sizeInMB < config.minSizeMB) return
  }

  // Check if UnCapped is active and running
  const online = await isPlexoHealthy()
  if (!online) {
    // UnCapped is offline: let Chrome download normally without interruption
    return
  }

  const cookies = await getCookiesForUrl(url)
  const initialFileName = downloadItem.filename
    ? downloadItem.filename.split(/[\\/]/).pop()
    : undefined

  // If Chrome already assigned a full path (e.g. default download path without Save As prompt),
  // transfer to UnCapped immediately without any delay!
  const hasFullPath =
    downloadItem.filename &&
    (downloadItem.filename.includes('\\') || downloadItem.filename.includes('/'))

  if (hasFullPath) {
    await handleFinalizedDownload(downloadItem.id, downloadItem.filename, {
      url,
      fileName: initialFileName,
      referrer: downloadItem.referrer,
      cookies,
      totalBytes: downloadItem.totalBytes > 0 ? downloadItem.totalBytes : undefined
    })
    return
  }

  // Save to pending storage so we wait for the user's Save As selection or Chrome's path determination
  await savePendingDownload(downloadItem.id, {
    id: downloadItem.id,
    url,
    fileName: initialFileName,
    referrer: downloadItem.referrer,
    cookies,
    totalBytes: downloadItem.totalBytes > 0 ? downloadItem.totalBytes : undefined,
    startTime: Date.now()
  })
})

// Listen for filename confirmation (fires when user clicks Save in dialog or default path is set)
chrome.downloads.onChanged.addListener(async (delta) => {
  // If download was canceled or interrupted (e.g. user pressed Cancel in Save As dialog)
  if (
    (delta.state && delta.state.current === 'interrupted') ||
    (delta.error && delta.error.current === 'USER_CANCELED')
  ) {
    await removePendingDownload(delta.id)
    return
  }

  const pending = await getPendingDownload(delta.id)
  if (!pending) return

  // User selected and confirmed a location in Chrome's Save As dialog (or Chrome determined path)
  if (delta.filename && delta.filename.current) {
    await handleFinalizedDownload(delta.id, delta.filename.current)
    return
  }

  // Fallback: If download is in_progress and filename has become available
  if (delta.state && delta.state.current === 'in_progress') {
    try {
      const items = await chrome.downloads.search({ id: delta.id })
      if (
        items &&
        items[0] &&
        items[0].filename &&
        (items[0].filename.includes('\\') || items[0].filename.includes('/'))
      ) {
        await handleFinalizedDownload(delta.id, items[0].filename)
      }
    } catch {
      // ignore
    }
  }
})

// Setup right-click Context Menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'uncapped-download-link',
    title: 'Download with UnCapped (Multi-Network)',
    contexts: ['link', 'image', 'video', 'audio']
  })
})

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'uncapped-download-link' && info.menuItemId !== 'plexo-download-link')
    return

  const targetUrl = info.linkUrl || info.srcUrl
  if (!targetUrl) return

  const online = await isPlexoHealthy()
  if (!online) return

  const cookies = await getCookiesForUrl(targetUrl)
  await sendDownloadToPlexo({
    url: targetUrl,
    cookies
  }).catch((err) => console.error('[UnCapped] Context menu download error:', err))
})
