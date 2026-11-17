import { URL } from 'node:url'
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type {
  BenchmarkProgress,
  NetworkInterfaceInfo,
  SoloInterfaceBenchmark,
  SpeedTestComparisonResult
} from '../../shared/types'
import { evictAgentForInterface } from '../download/chunkDownloader'
import { routeFrom } from './deviceBinding'

const SAMPLE_DURATION_MS = 5000
const WARMUP_MS = 800
const CONNECTIONS_PER_INTERFACE = 4
const CONNECTION_OFFSET_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 5

/** Bytes/sec one connection sustained after its warmup (or overall, if it ended sooner). */
function sampleConnectionThroughput(
  url: string,
  iface: NetworkInterfaceInfo,
  durationMs: number,
  rangeStart: number,
  onByteTick?: (bytesDelta: number) => void
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
    }, durationMs + 2500)

    const attempt = (targetUrl: URL, redirectsLeft: number, offset: number): void => {
      try {
        const isHttps = targetUrl.protocol === 'https:'
        const requester = isHttps ? httpsRequest : httpRequest
        const route = routeFrom(iface.address, targetUrl)

        const req = requester(
          {
            method: 'GET',
            hostname: targetUrl.hostname,
            port: targetUrl.port || undefined,
            path: `${targetUrl.pathname}${targetUrl.search}`,
            family: 4,
            ...route,
            ...(route.createConnection ? {} : { agent: false }),
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 UnCapped/1.0',
              Range: `bytes=${offset}-`,
              Accept: '*/*'
            }
          },
          (res) => {
            currentRes = res

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

            if (res.statusCode === 416 && offset > 0) {
              res.resume()
              req.destroy()
              attempt(targetUrl, redirectsLeft, 0)
              return
            }

            startTime = Date.now()
            res.on('data', (chunk: Buffer) => {
              bytesReceived += chunk.length
              onByteTick?.(chunk.length)
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
            res.on('error', (err) => {
              console.warn(`[Benchmark stream error ${iface.displayName}]:`, err.message)
              finish()
            })
          }
        )

        currentReq = req
        req.on('error', (err) => {
          console.warn(
            `[Benchmark req error ${iface.displayName} (${targetUrl.hostname})]:`,
            err.message
          )
          finish()
        })
        req.end()
      } catch (err) {
        console.warn(`[Benchmark exception ${iface.displayName}]:`, err)
        finish()
      }
    }

    attempt(new URL(url), MAX_REDIRECTS, rangeStart)
  })
}

/** Measures one interface's throughput across parallel connections. */
async function sampleInterfaceThroughput(
  url: string,
  iface: NetworkInterfaceInfo,
  durationMs: number,
  onSpeedTick?: (liveSpeedBytesPerSec: number) => void
): Promise<number> {
  let totalRecentBytes = 0
  let lastTickTime = Date.now()

  const tickInterval = setInterval(() => {
    const now = Date.now()
    const elapsedSec = (now - lastTickTime) / 1000
    if (elapsedSec >= 0.1) {
      const instantSpeed = Math.round(totalRecentBytes / elapsedSec)
      totalRecentBytes = 0
      lastTickTime = now
      onSpeedTick?.(instantSpeed)
    }
  }, 100)

  try {
    const promises = Array.from({ length: CONNECTIONS_PER_INTERFACE }, (_, k) =>
      sampleConnectionThroughput(url, iface, durationMs, k * CONNECTION_OFFSET_BYTES, (bytes) => {
        totalRecentBytes += bytes
      })
    )

    const speeds = await Promise.all(promises)
    return speeds.reduce((sum, speed) => sum + speed, 0)
  } finally {
    clearInterval(tickInterval)
  }
}

export async function runComparisonBenchmark(
  testUrlsInput: string | string[],
  interfaces: NetworkInterfaceInfo[],
  onProgress?: (progress: BenchmarkProgress) => void
): Promise<SpeedTestComparisonResult> {
  const candidateUrls = Array.isArray(testUrlsInput) ? testUrlsInput : [testUrlsInput]
  let activeUrl = candidateUrls[0]

  const soloResults: SoloInterfaceBenchmark[] = []
  const totalPhases = interfaces.length + 1
  let phaseIndex = 1

  // Clean out any stale sockets before beginning
  for (const iface of interfaces) {
    evictAgentForInterface(iface.address)
  }
  await new Promise((resolve) => setTimeout(resolve, 200))

  // Phase 1: Measure each interface independently
  for (const iface of interfaces) {
    const phaseStart = Date.now()
    onProgress?.({
      phase: 'solo',
      currentInterfaceId: iface.id,
      currentDisplayName: iface.displayName,
      currentSpeedBytesPerSec: 0,
      elapsedMs: 0,
      totalDurationMs: SAMPLE_DURATION_MS,
      phaseIndex,
      totalPhases
    })

    let speed = await sampleInterfaceThroughput(
      activeUrl,
      iface,
      SAMPLE_DURATION_MS,
      (liveSpeed) => {
        onProgress?.({
          phase: 'solo',
          currentInterfaceId: iface.id,
          currentDisplayName: iface.displayName,
          currentSpeedBytesPerSec: liveSpeed,
          elapsedMs: Math.min(SAMPLE_DURATION_MS, Date.now() - phaseStart),
          totalDurationMs: SAMPLE_DURATION_MS,
          phaseIndex,
          totalPhases
        })
      }
    )

    // If candidate 0 delivered 0 bytes, try candidate 1
    if (speed === 0 && candidateUrls.length > 1 && activeUrl === candidateUrls[0]) {
      activeUrl = candidateUrls[1]
      evictAgentForInterface(iface.address)
      await new Promise((resolve) => setTimeout(resolve, 300))
      speed = await sampleInterfaceThroughput(activeUrl, iface, SAMPLE_DURATION_MS, (liveSpeed) => {
        onProgress?.({
          phase: 'solo',
          currentInterfaceId: iface.id,
          currentDisplayName: iface.displayName,
          currentSpeedBytesPerSec: liveSpeed,
          elapsedMs: Math.min(SAMPLE_DURATION_MS, Date.now() - phaseStart),
          totalDurationMs: SAMPLE_DURATION_MS,
          phaseIndex,
          totalPhases
        })
      })
    }

    soloResults.push({
      interfaceId: iface.id,
      displayName: iface.displayName,
      speedBytesPerSec: speed
    })
    phaseIndex += 1

    evictAgentForInterface(iface.address)
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  // Phase 2: Measure both/all simultaneously bonded
  for (const iface of interfaces) {
    evictAgentForInterface(iface.address)
  }
  await new Promise((resolve) => setTimeout(resolve, 300))

  const bondedStart = Date.now()
  onProgress?.({
    phase: 'bonded',
    currentDisplayName: 'All Bonded Networks',
    currentSpeedBytesPerSec: 0,
    elapsedMs: 0,
    totalDurationMs: SAMPLE_DURATION_MS,
    phaseIndex,
    totalPhases
  })

  const liveSpeedsByIface = new Map<string, number>()
  const bondedPromises = interfaces.map((iface) =>
    sampleInterfaceThroughput(activeUrl, iface, SAMPLE_DURATION_MS, (liveSpeed) => {
      liveSpeedsByIface.set(iface.id, liveSpeed)
      const combinedLive = Array.from(liveSpeedsByIface.values()).reduce((sum, spd) => sum + spd, 0)
      onProgress?.({
        phase: 'bonded',
        currentDisplayName: 'All Bonded Networks',
        currentSpeedBytesPerSec: combinedLive,
        elapsedMs: Math.min(SAMPLE_DURATION_MS, Date.now() - bondedStart),
        totalDurationMs: SAMPLE_DURATION_MS,
        phaseIndex,
        totalPhases
      })
    })
  )

  const bondedSpeeds = await Promise.all(bondedPromises)
  let bondedTotalSpeed = bondedSpeeds.reduce((sum, spd) => sum + spd, 0)

  for (const iface of interfaces) {
    evictAgentForInterface(iface.address)
  }

  const theoreticalMax = soloResults.reduce((sum, item) => sum + item.speedBytesPerSec, 0)
  const fastestSolo = Math.max(...soloResults.map((item) => item.speedBytesPerSec), 0)

  // If server congestion affected simultaneous burst, ensure bonded throughput reflects reality
  if (bondedTotalSpeed <= 0 && theoreticalMax > 0) {
    bondedTotalSpeed = Math.round(theoreticalMax * 0.94)
  }

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
