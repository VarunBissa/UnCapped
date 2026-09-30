import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { app, type BrowserWindow } from 'electron'
import type { DownloadManager } from '../download/downloadManager'
import { getDefaultDownloadsDir } from '../download/paths'
import { isMagnetUrl, isTorrentFile, probeUrl } from '../download/probe'
import { listActiveInterfaces } from '../network/interfaces'
import { loadLastDownloadDir } from '../settings'

export const EXTENSION_BRIDGE_PORT = 23851
export const EXTENSION_BRIDGE_HOST = '127.0.0.1'

let server: Server | null = null

interface DownloadPayload {
  url: string
  fileName?: string
  destinationDir?: string
  referrer?: string
  cookies?: string
  totalBytes?: number
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-UnCapped-Token, X-Plexo-Token, Access-Control-Request-Private-Network'
  )
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  statusCode: number,
  data: unknown
): void {
  setCorsHeaders(req, res)
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 2 * 1024 * 1024) {
        // Guard against overly large payloads (max 2MB)
        reject(new Error('Payload too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

export function startExtensionBridge(
  manager: DownloadManager,
  getMainWindow: () => BrowserWindow | null
): Server | null {
  if (server) return server

  server = createServer(async (req, res) => {
    setCorsHeaders(req, res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const parsedUrl = new URL(req.url || '/', `http://${EXTENSION_BRIDGE_HOST}`)
    const path = parsedUrl.pathname

    if (req.method === 'GET' && (path === '/health' || path === '/status')) {
      sendJson(req, res, 200, {
        status: 'ok',
        app: 'UnCapped',
        version: app.getVersion()
      })
      return
    }

    if (req.method === 'POST' && path === '/download') {
      try {
        const payload = await parseJsonBody<DownloadPayload>(req)
        if (!payload.url || typeof payload.url !== 'string') {
          sendJson(req, res, 400, { success: false, error: 'URL is required' })
          return
        }

        // Focus the UnCapped main window
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        }

        const lastDir = await loadLastDownloadDir()
        const destinationDir = payload.destinationDir || lastDir || getDefaultDownloadsDir()
        const interfaces = await listActiveInterfaces()
        const interfaceIds = interfaces.map((i) => i.id)

        const isTorrent = isMagnetUrl(payload.url) || isTorrentFile(payload.url)

        let finalUrl = payload.url
        let suggestedFileName = payload.fileName || 'download'
        let totalBytes = payload.totalBytes || 0
        let supportsRanges = true
        let etag: string | null = null
        let lastModified: string | null = null

        if (!isTorrent) {
          // If browser already supplied filename and size, do NOT block the hand-off on a slow network probe!
          if (payload.fileName && payload.totalBytes && payload.totalBytes > 0) {
            suggestedFileName = payload.fileName
            totalBytes = payload.totalBytes
            supportsRanges = true
          } else {
            // Fast probe with a 1.5-second timeout so hand-off to UnCapped is near-instantaneous
            try {
              const probePromise = probeUrl(payload.url)
              const timeoutPromise = new Promise<null>((resolve) =>
                setTimeout(() => resolve(null), 1500)
              )
              const probe = await Promise.race([probePromise, timeoutPromise])
              if (probe) {
                finalUrl = probe.finalUrl || payload.url
                suggestedFileName = payload.fileName || probe.suggestedFileName
                totalBytes = probe.totalBytes || payload.totalBytes || 0
                supportsRanges = probe.supportsRanges
                etag = probe.etag
                lastModified = probe.lastModified
              }
            } catch (probeError) {
              console.warn(
                '[ExtensionBridge] Fast probe failed, continuing with browser metadata:',
                probeError
              )
            }
          }
        }

        // If a download is actively transferring, pause it gracefully to prioritize the new download
        if (manager.hasActiveDownload()) {
          const current = await manager.getCurrentDownload()
          if (current && (current.status === 'downloading' || current.status === 'assembling')) {
            await manager.pause(current.id)
          }
        }

        const downloadId = await manager.start({
          url: finalUrl,
          destinationDir,
          suggestedFileName,
          totalBytes,
          supportsRanges,
          interfaceIds,
          chunkCount: isTorrent
            ? Math.max(2, interfaces.length * 2)
            : supportsRanges
              ? Math.max(2, interfaces.length * 2)
              : 1,
          connectionsPerNetwork: 2,
          etag,
          lastModified
        })

        sendJson(req, res, 200, {
          success: true,
          downloadId,
          fileName: suggestedFileName,
          destinationDir
        })
      } catch (error) {
        console.error('[ExtensionBridge] Failed to start download from browser:', error)
        sendJson(req, res, 500, {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
      return
    }

    sendJson(req, res, 404, { error: 'Not found' })
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(
        `[ExtensionBridge] Port ${EXTENSION_BRIDGE_PORT} is already in use. Extension bridge will be unavailable.`
      )
    } else {
      console.error('[ExtensionBridge] Server error:', err)
    }
  })

  server.listen(EXTENSION_BRIDGE_PORT, EXTENSION_BRIDGE_HOST, () => {
    console.log(
      `[ExtensionBridge] Listening for Chrome extension at http://${EXTENSION_BRIDGE_HOST}:${EXTENSION_BRIDGE_PORT}`
    )
  })

  return server
}

export function stopExtensionBridge(): void {
  if (server) {
    server.close()
    server = null
  }
}
