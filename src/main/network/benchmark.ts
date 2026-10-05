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

const SAMPLE_DURATION_MS = 2500
const MAX_REDIRECTS = 5

function sampleInterfaceThroughput(
  url: string,
  iface: NetworkInterfaceInfo,
  durationMs = SAMPLE_DURATION_MS
): Promise<number> {
  return new Promise<number>((resolve) => {
    let bytesReceived = 0
    let startTime = 0
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
      const elapsedSec = (Date.now() - (startTime || Date.now())) / 1000
      if (elapsedSec <= 0.1 || bytesReceived === 0) {
        resolve(0)
      } else {
        resolve(Math.round(bytesReceived / elapsedSec))
      }
    }

    const timer = setTimeout(() => {
      finish()
    }, durationMs + 1500)

    const attempt = (targetUrl: URL, redirectsLeft: number): void => {
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
              // 50 MB sampling window so high-speed connections don't exhaust the range early
              Range: 'bytes=0-52428799'
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
              attempt(nextUrl, redirectsLeft - 1)
              return
            }

            startTime = Date.now()
            res.on('data', (chunk: Buffer) => {
              bytesReceived += chunk.length
              if (Date.now() - startTime >= durationMs) {
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

    attempt(new URL(url), MAX_REDIRECTS)
  })
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
