import { URL } from 'node:url'
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type {
  NetworkInterfaceInfo,
  SoloInterfaceBenchmark,
  SpeedTestComparisonResult
} from '../../shared/types'
import { getAgentsForInterface } from '../download/chunkDownloader'
import { routeFrom } from './deviceBinding'

// Long enough to get past TCP slow-start and measure what the link really sustains; the first
// WARMUP_MS of every connection is left out of the average for the same reason.
const SAMPLE_DURATION_MS = 5000
const WARMUP_MS = 1000
// One TCP connection can't fill a fast, high-latency link (a tethered phone especially), and
// that's not what a download uses either — so each interface is sampled over several.
const CONNECTIONS_PER_INTERFACE = 4
// Each connection reads its own part of the file, so none of them run out of bytes early. Small
// enough to stay inside the 100 MB test files.
const CONNECTION_OFFSET_BYTES = 16 * 1024 * 1024
const MAX_REDIRECTS = 5

/** Bytes/sec one connection sustained after its warmup (or overall, if it ended sooner). */
function sampleConnectionThroughput(
  url: string,
  iface: NetworkInterfaceInfo,
  durationMs: number,
  rangeStart: number
): Promise<number> {
  return new Promise<number>((resolve) => {
    let bytesReceived = 0
    let startTime = 0
    let warmBytes: number | null = null
    let warmTime = 0
    let finished = false
    let currentReq: ClientRequest | null = null
    let currentRes: IncomingMessage | null = null

    const finish = (): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (currentReq && !currentReq.destroyed) {
        currentReq.destroy()
      }
      if (currentRes && !currentRes.destroyed) {
        currentRes.destroy()
      }
      const now = Date.now()
      if (warmBytes !== null && now - warmTime >= 250) {
        resolve(Math.round((bytesReceived - warmBytes) / ((now - warmTime) / 1000)))
        return
      }
      const elapsedSec = (now - (startTime || now)) / 1000
      if (elapsedSec <= 0.1 || bytesReceived === 0) {
        resolve(0)
      } else {
        resolve(Math.round(bytesReceived / elapsedSec))
      }
    }

    const timer = setTimeout(() => {
      finish()
    }, durationMs + 3000)

    const attempt = (targetUrl: URL, redirectsLeft: number, offset: number): void => {
      try {
        const isHttps = targetUrl.protocol === 'https:'
        const requester = isHttps ? httpsRequest : httpRequest
        const route = routeFrom(iface.address, targetUrl)
        const agents = getAgentsForInterface(iface.address)
        const agent = isHttps ? agents.https : agents.http

        const req = requester(
          {
            method: 'GET',
            hostname: targetUrl.hostname,
            port: targetUrl.port || undefined,
            path: `${targetUrl.pathname}${targetUrl.search}`,
            ...route,
            ...(route.createConnection ? {} : { agent }),
            headers: {
              'User-Agent': 'UnCapped-Benchmark/1.0',
              // Open-ended from this connection's own offset; it's cut off after durationMs
              Range: `bytes=${offset}-`
            }
          },
          (res) => {
            currentRes = res

            // Follow HTTP redirects
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location &&
              redirectsLeft > 0
            ) {
              const nextUrl = new URL(res.headers.location, targetUrl)
              req.destroy()
              attempt(nextUrl, redirectsLeft - 1, offset)
              return
            }

            // A file smaller than this connection's offset: read it from the start instead.
            if (res.statusCode === 416 && offset > 0) {
              res.resume()
              req.destroy()
              attempt(targetUrl, redirectsLeft, 0)
              return
            }

            startTime = Date.now()
            res.on('data', (chunk: Buffer) => {
              bytesReceived += chunk.length
              const now = Date.now()
              if (warmBytes === null && now - startTime >= WARMUP_MS) {
                warmBytes = bytesReceived
                warmTime = now
              }
              if (now - startTime >= durationMs) {
                finish()
              }
            })
            res.on('end', () => finish())
            res.on('error', () => finish())
          }
        )

        currentReq = req
        req.on('error', (err) => {
          console.warn(`[Benchmark] Request error on ${iface.displayName}:`, err.message)
          finish()
        })
        req.end()
      } catch (err) {
        console.warn(`[Benchmark] Exception starting request on ${iface.displayName}:`, err)
        finish()
      }
    }

    attempt(new URL(url), MAX_REDIRECTS, rangeStart)
  })
}

/** What one interface sustains over several parallel connections. */
async function sampleInterfaceThroughput(
  url: string,
  iface: NetworkInterfaceInfo,
  durationMs = SAMPLE_DURATION_MS
): Promise<number> {
  const speeds = await Promise.all(
    Array.from({ length: CONNECTIONS_PER_INTERFACE }, (_, k) =>
      sampleConnectionThroughput(url, iface, durationMs, k * CONNECTION_OFFSET_BYTES)
    )
  )
  return speeds.reduce((sum, speed) => sum + speed, 0)
}

export async function runComparisonBenchmark(
  testUrl: string,
  interfaces: NetworkInterfaceInfo[]
): Promise<SpeedTestComparisonResult> {
  const soloResults: SoloInterfaceBenchmark[] = []

  // Phase 1: Measure each interface independently
  for (const iface of interfaces) {
    const speed = await sampleInterfaceThroughput(testUrl, iface, SAMPLE_DURATION_MS)
    soloResults.push({
      interfaceId: iface.id,
      displayName: iface.displayName,
      speedBytesPerSec: speed
    })
  }

  // Phase 2: Measure both simultaneously bonded
  const bondedPromises = interfaces.map((iface) =>
    sampleInterfaceThroughput(testUrl, iface, SAMPLE_DURATION_MS)
  )
  const bondedSpeeds = await Promise.all(bondedPromises)
  const bondedTotalSpeed = bondedSpeeds.reduce((sum, spd) => sum + spd, 0)

  const theoreticalMax = soloResults.reduce((sum, item) => sum + item.speedBytesPerSec, 0)
  const fastestSolo = Math.max(...soloResults.map((item) => item.speedBytesPerSec), 0)

  const efficiency =
    theoreticalMax > 0 ? Math.min(100, Math.round((bondedTotalSpeed / theoreticalMax) * 100)) : 100

  const speedup =
    fastestSolo > 0 && bondedTotalSpeed > fastestSolo
      ? Math.round(((bondedTotalSpeed - fastestSolo) / fastestSolo) * 100)
      : 0

  return {
    solo: soloResults,
    bondedSpeedBytesPerSec: bondedTotalSpeed,
    theoreticalMaxBytesPerSec: theoreticalMax,
    bondingEfficiencyPercent: efficiency,
    speedupPercentOverFastestSolo: speedup,
    fastestSoloBytesPerSec: fastestSolo,
    timestamp: Date.now()
  }
}
