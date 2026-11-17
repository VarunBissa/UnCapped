import type {
  BenchmarkProgress,
  NetworkInterfaceInfo,
  ProbeResult,
  SpeedTestComparisonResult
} from '@shared/types'
import {
  AlertCircle,
  CheckCircle2,
  Gauge,
  History,
  Loader2,
  Trash2,
  TrendingUp,
  Zap
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNetworkVisuals } from '../hooks/useNetworkVisuals'
import { useAppStore } from '../store/useAppStore'
import { formatBytes, formatSpeed } from '../utils/format'
import { Button } from './ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from './ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface SpeedOption {
  id: string
  label: string
  sizeMb: number
  sizeLabel: string
  urls: string[]
  description: string
}

const SPEED_OPTIONS: SpeedOption[] = [
  {
    id: '10mb',
    label: '10 MB',
    sizeMb: 10,
    sizeLabel: '10MB',
    urls: [
      'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe',
      'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi'
    ],
    description: 'Quick check (~1-2s)'
  },
  {
    id: '100mb',
    label: '100 MB',
    sizeMb: 100,
    sizeLabel: '100MB',
    urls: [
      'https://dl.google.com/chrome/install/ChromeStandaloneSetup64.exe',
      'https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.12.tar.xz'
    ],
    description: 'Standard bonded test'
  },
  {
    id: '1gb',
    label: '1 GB',
    sizeMb: 1000,
    sizeLabel: '1GB',
    urls: [
      'https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img',
      'https://repo.almalinux.org/almalinux/9/isos/x86_64/AlmaLinux-9-latest-x86_64-minimal.iso'
    ],
    description: 'High-bandwidth stress test'
  }
]

const SPEED_TEST_STREAMS_PER_NETWORK = 6

function LiveSpeedGauge({
  progress,
  statusText
}: {
  progress: BenchmarkProgress | null
  statusText: string | null
}): React.JSX.Element {
  const speedBytes = progress?.currentSpeedBytesPerSec || 0
  const mbps = ((speedBytes * 8) / 1_000_000).toFixed(1)
  const isBonded = progress?.phase === 'bonded'
  const percentTime = progress
    ? Math.min(100, Math.round((progress.elapsedMs / progress.totalDurationMs) * 100))
    : 0

  // Gauge percent scaled up to 60 MB/s (~480 Mbps)
  const maxScaleBytes = 60 * 1024 * 1024
  const gaugePercent = Math.min(100, Math.max(3, Math.round((speedBytes / maxScaleBytes) * 100)))

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-primary/40 bg-card p-4 shadow-sm animate-in fade-in zoom-in-95">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase ${
            isBonded
              ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
              : 'bg-primary/15 text-primary border border-primary/30'
          }`}
        >
          <span className="size-1.5 rounded-full bg-current animate-ping" />
          {isBonded
            ? '⚡ Bonded Aggregate Test'
            : `Phase ${progress?.phaseIndex || 1} of ${progress?.totalPhases || 3}: Solo Test`}
        </span>
      </div>

      <div className="font-sans text-[12px] font-medium text-foreground text-center truncate max-w-xs">
        {progress?.currentDisplayName || statusText || 'Sampling network throughput…'}
      </div>

      {/* Semicircular Speed Gauge Meter */}
      <div className="relative flex flex-col items-center justify-center my-0.5">
        <svg className="w-52 h-26 overflow-visible" viewBox="0 0 200 100">
          <path
            d="M 25 100 A 75 75 0 0 1 175 100"
            fill="none"
            stroke="var(--border)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M 25 100 A 75 75 0 0 1 175 100"
            fill="none"
            stroke={isBonded ? '#10b981' : '#3b82f6'}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray="235.6"
            strokeDashoffset={235.6 - (235.6 * gaugePercent) / 100}
            className="transition-all duration-150 ease-out"
          />
        </svg>

        <div className="absolute bottom-1 flex flex-col items-center text-center">
          <span className="font-mono text-2xl font-black tracking-tight text-foreground">
            {formatSpeed(speedBytes)}
          </span>
          <span className="font-mono text-[11px] font-semibold text-emerald-500 flex items-center gap-0.5">
            <Zap className="size-3 fill-current" /> {mbps} Mbps
          </span>
        </div>
      </div>

      {/* Phase progress line */}
      <div className="w-full space-y-1">
        <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
          <span>Sampling throughput</span>
          <span>{percentTime}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full transition-all duration-150 ease-out ${
              isBonded ? 'bg-emerald-500' : 'bg-primary'
            }`}
            style={{ width: `${percentTime}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export function SpeedTestButton(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [selectedSize, setSelectedSize] = useState<SpeedOption>(SPEED_OPTIONS[2])
  const [deselectedIds, setDeselectedIds] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [benchmarkMode, setBenchmarkMode] = useState<'standard' | 'benchmark'>('benchmark')
  const [comparisonResult, setComparisonResult] = useState<SpeedTestComparisonResult | null>(null)
  const [benchmarkStatus, setBenchmarkStatus] = useState<string | null>(null)
  const [liveProgress, setLiveProgress] = useState<BenchmarkProgress | null>(null)

  useEffect(() => {
    if (!testing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveProgress(null)
      return
    }
    const unsub = window.uncapped.onBenchmarkProgress?.((prog) => {
      setLiveProgress(prog)
    })
    return () => unsub?.()
  }, [testing])

  const interfaces = useAppStore((store) => store.interfaces)
  const loadInterfaces = useAppStore((store) => store.loadInterfaces)
  const refreshLatencies = useAppStore((store) => store.refreshLatencies)
  const latencies = useAppStore((store) => store.latencies)
  const downloadsDir = useAppStore((store) => store.downloadsDir)
  const homeDir = useAppStore((store) => store.homeDir)
  const currentDownload = useAppStore((store) => store.currentDownload)
  const setActiveView = useAppStore((store) => store.setActiveView)
  const lastSpeedTestResult = useAppStore((store) => store.lastSpeedTestResult)
  const clearLastSpeedTestResult = useAppStore((store) => store.clearLastSpeedTestResult)
  const visuals = useNetworkVisuals()

  const selectedIds = interfaces.map((i) => i.id).filter((id) => !deselectedIds.includes(id))

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen) {
      setDeselectedIds([])
      setError(null)
      void loadInterfaces()
      void refreshLatencies()
    }
    setOpen(nextOpen)
  }

  const toggleInterface = (id: string): void => {
    setDeselectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id)
      }
      if (selectedIds.length <= 1) return prev // Keep at least one selected
      return [...prev, id]
    })
  }

  const isDownloadActive =
    currentDownload &&
    (currentDownload.status === 'downloading' || currentDownload.status === 'assembling')

  const handleStartSpeedTest = async (): Promise<void> => {
    if (isDownloadActive) {
      setError('A download is currently running. Please finish or pause it first.')
      return
    }

    if (
      currentDownload?.fileName?.startsWith('UnCapped-SpeedTest-') ||
      currentDownload?.fileName?.startsWith('UnCapped-SpeedTest-')
    ) {
      void window.uncapped.removeDownload(currentDownload.id).catch(() => {})
    }

    if (selectedIds.length === 0) {
      setError('Please select at least one network interface to test.')
      return
    }

    setTesting(true)
    setError(null)

    try {
      let probe: ProbeResult | null = null
      let lastErr: Error | null = null

      for (const url of selectedSize.urls) {
        try {
          const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Candidate timeout')), 3500)
          )
          probe = await Promise.race([window.uncapped.probeUrl(url), timeoutPromise])
          if (probe) break
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err))
        }
      }

      if (!probe) {
        throw lastErr || new Error('Could not connect to speed test server.')
      }

      await window.uncapped.startDownload({
        url: probe.finalUrl,
        destinationDir: downloadsDir || homeDir,
        suggestedFileName: `UnCapped-SpeedTest-${selectedSize.sizeLabel}.bin`,
        totalBytes: Math.min(
          probe.totalBytes ?? selectedSize.sizeMb * 1024 * 1024,
          selectedSize.sizeMb * 1024 * 1024
        ),
        supportsRanges: probe.supportsRanges,
        interfaceIds: selectedIds,
        // One TCP stream can't fill a fast high-latency link (a tethered phone especially);
        // the download also adds streams on its own where they keep helping.
        chunkCount: selectedIds.length * SPEED_TEST_STREAMS_PER_NETWORK,
        connectionsPerNetwork: SPEED_TEST_STREAMS_PER_NETWORK,
        etag: probe.etag,
        lastModified: probe.lastModified
      })

      setOpen(false)
      setActiveView('detail')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start speed test')
    } finally {
      setTesting(false)
    }
  }

  const handleRunComparisonBenchmark = async (): Promise<void> => {
    if (isDownloadActive) {
      setError('A download is currently running. Please finish or pause it first.')
      return
    }

    if (selectedIds.length === 0) {
      setError('Please select at least one network interface to test.')
      return
    }

    setTesting(true)
    setError(null)
    setBenchmarkStatus('Connecting & sampling interfaces…')

    try {
      setBenchmarkStatus('Connecting & sampling interfaces…')
      const result = await window.uncapped.runComparisonSpeedTest(selectedSize.urls, selectedIds)
      setComparisonResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete benchmark')
    } finally {
      setTesting(false)
      setBenchmarkStatus(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              render={
                <button
                  type="button"
                  aria-label="Run Speed Test"
                  className="flex h-[26px] items-center gap-1.5 rounded-[6px] border-[0.5px] border-border bg-secondary px-2 font-mono text-[11px] font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer [-webkit-app-region:no-drag]"
                >
                  <Zap className="size-3 text-amber-500 fill-amber-500" />
                  <span className="hidden sm:inline">Speed Test</span>
                </button>
              }
            />
          }
        />
        <TooltipContent>Run bonded multi-network speed test</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-md max-h-[88vh] overflow-y-auto gap-4 p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
            <Gauge className="size-4" />
          </div>
          <div>
            <DialogTitle className="font-sans text-[15px] font-bold tracking-tight text-foreground">
              Bonded Speed Test
            </DialogTitle>
            <p className="font-sans text-[11.5px] text-muted-foreground">
              Benchmark real-time download speed across your active networks.
            </p>
          </div>
        </div>

        {/* Benchmark Mode Selector */}
        <div className="flex rounded-lg border border-border bg-secondary/30 p-1">
          <button
            type="button"
            onClick={() => setBenchmarkMode('benchmark')}
            className={`flex-1 rounded-md py-1 text-center font-mono text-[11px] font-semibold transition-all cursor-pointer ${
              benchmarkMode === 'benchmark'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            ⚡ Proof Benchmark (Solo vs. Bonded)
          </button>
          <button
            type="button"
            onClick={() => setBenchmarkMode('standard')}
            className={`flex-1 rounded-md py-1 text-center font-mono text-[11px] font-semibold transition-all cursor-pointer ${
              benchmarkMode === 'standard'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Quick Download Test
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-[11.5px] text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Live Speed Meter Gauge when Benchmark is Running */}
        {testing && benchmarkMode === 'benchmark' && (
          <LiveSpeedGauge progress={liveProgress} statusText={benchmarkStatus} />
        )}

        {/* Comparison Benchmark Result Card */}
        {comparisonResult && !testing && (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3.5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-emerald-500 font-semibold font-mono text-[11px] uppercase tracking-wider">
                <CheckCircle2 className="size-4" />
                Bonding Proof Result
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {new Date(comparisonResult.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>

            {/* Efficiency and Speedup Badges */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-emerald-500/30 bg-card p-2.5 text-center">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Bonding Efficiency
                </span>
                <div className="font-mono text-xl font-extrabold text-emerald-500">
                  {comparisonResult.bondingEfficiencyPercent}%
                </div>
                <span className="font-sans text-[10px] text-muted-foreground">
                  of combined capacity
                </span>
              </div>

              <div className="rounded-lg border border-primary/30 bg-card p-2.5 text-center">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Speed Boost
                </span>
                <div className="font-mono text-xl font-extrabold text-primary flex items-center justify-center gap-0.5">
                  <TrendingUp className="size-4" />+{comparisonResult.speedupPercentOverFastestSolo}
                  %
                </div>
                <span className="font-sans text-[10px] text-muted-foreground">
                  faster than single link
                </span>
              </div>
            </div>

            {/* Solo Breakdown */}
            <div className="space-y-1.5 pt-1">
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                Throughput Breakdown
              </span>
              <div className="space-y-1 font-mono text-[11px]">
                {comparisonResult.solo.map((s) => (
                  <div
                    key={s.interfaceId}
                    className="flex justify-between items-center rounded bg-secondary/40 px-2 py-1"
                  >
                    <span className="text-muted-foreground truncate max-w-[170px]">
                      {s.displayName} (Solo)
                    </span>
                    <span className="font-semibold text-foreground">
                      {formatSpeed(s.speedBytesPerSec)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 font-bold">
                  <span className="text-emerald-500 flex items-center gap-1">
                    <Zap className="size-3.5 fill-current" />{' '}
                    {comparisonResult.solo.length === 2
                      ? 'Both Bonded'
                      : comparisonResult.solo.length > 2
                        ? 'All Bonded'
                        : 'Bonded Throughput'}
                  </span>
                  <span className="text-emerald-500 text-[12px]">
                    {formatSpeed(comparisonResult.bondedSpeedBytesPerSec)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Last Speed Test Result History Card */}
        {lastSpeedTestResult && benchmarkMode === 'standard' && (
          <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-secondary/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <History className="size-3.5 text-amber-500" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground">
                  Last Test Result
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  ·{' '}
                  {new Date(lastSpeedTestResult.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <button
                type="button"
                onClick={clearLastSpeedTestResult}
                className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                title="Clear history"
              >
                <Trash2 className="size-3" />
                <span>Clear</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-0.5">
              <div className="flex flex-col items-center justify-center rounded-lg border border-border/60 bg-card p-2 text-center">
                <span className="font-mono text-[9px] uppercase text-muted-foreground">
                  Avg Speed
                </span>
                <span className="font-mono text-[13px] font-bold text-foreground">
                  {formatSpeed(lastSpeedTestResult.averageSpeedBytesPerSec)}
                </span>
                <span className="font-mono text-[9.5px] text-emerald-500 font-semibold">
                  {((lastSpeedTestResult.averageSpeedBytesPerSec * 8) / 1_000_000).toFixed(1)} Mbps
                </span>
              </div>

              <div className="flex flex-col items-center justify-center rounded-lg border border-border/60 bg-card p-2 text-center">
                <span className="font-mono text-[9px] uppercase text-muted-foreground">
                  Peak Speed
                </span>
                <span className="font-mono text-[13px] font-bold text-foreground">
                  {formatSpeed(lastSpeedTestResult.peakSpeedBytesPerSec)}
                </span>
                <span className="font-mono text-[9.5px] text-amber-500 font-semibold">
                  {((lastSpeedTestResult.peakSpeedBytesPerSec * 8) / 1_000_000).toFixed(1)} Mbps
                </span>
              </div>

              <div className="flex flex-col items-center justify-center rounded-lg border border-border/60 bg-card p-2 text-center">
                <span className="font-mono text-[9px] uppercase text-muted-foreground">
                  Payload
                </span>
                <span className="font-mono text-[13px] font-bold text-foreground">
                  {formatBytes(lastSpeedTestResult.totalBytes)}
                </span>
                <span className="font-mono text-[9.5px] text-muted-foreground">
                  in {(lastSpeedTestResult.durationMs / 1000).toFixed(1)}s
                </span>
              </div>
            </div>

            {lastSpeedTestResult.interfaces && lastSpeedTestResult.interfaces.length > 0 && (
              <div className="flex flex-col gap-1 pt-1.5 border-t border-border/50">
                <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
                  Network Contribution
                </span>
                <div className="flex flex-col gap-1">
                  {lastSpeedTestResult.interfaces.map((iface) => {
                    const percent =
                      lastSpeedTestResult.totalBytes > 0
                        ? Math.round((iface.bytesDownloaded / lastSpeedTestResult.totalBytes) * 100)
                        : 0
                    return (
                      <div
                        key={iface.id}
                        className="flex items-center justify-between font-mono text-[10px]"
                      >
                        <span className="truncate max-w-[160px] text-foreground font-medium">
                          {iface.name}
                        </span>
                        <div className="flex items-center gap-2 text-muted-foreground tabular-nums">
                          <span>{formatBytes(iface.bytesDownloaded)}</span>
                          <span className="font-semibold text-foreground/90">({percent}%)</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Networks Selection Section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Bonded Interfaces ({selectedIds.length} of {interfaces.length})
            </span>
            {selectedIds.length > 1 ? (
              <span className="font-mono text-[10px] font-semibold text-emerald-500">
                ⚡ Bonding Active
              </span>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">Single Connection</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
            {interfaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-4 text-center">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                <span className="font-sans text-[11px] text-muted-foreground">
                  Detecting connected networks…
                </span>
              </div>
            ) : (
              interfaces.map((iface: NetworkInterfaceInfo) => {
                const visual = visuals(iface.id, iface.kind, iface.displayName)
                const selected = selectedIds.includes(iface.id)
                const ping = latencies[iface.id]

                return (
                  <button
                    type="button"
                    key={iface.id}
                    onClick={() => toggleInterface(iface.id)}
                    className={`flex items-center justify-between rounded-lg border p-2 text-left transition-colors cursor-pointer ${
                      selected
                        ? 'border-border bg-card shadow-xs'
                        : 'border-transparent bg-secondary/50 opacity-60 hover:opacity-80'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`flex size-4 shrink-0 items-center justify-center rounded-[3.5px] border text-[9px] font-bold ${
                          selected
                            ? 'border-transparent text-white'
                            : 'border-muted-foreground/40 bg-transparent'
                        }`}
                        style={{ background: selected ? visual.solid : 'transparent' }}
                      >
                        {selected ? '✓' : ''}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-sans text-[12px] font-semibold text-foreground">
                          {visual.name}
                        </div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">
                          {iface.device} · {iface.address}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase"
                        style={{
                          background: visual.bg,
                          color: visual.text,
                          borderColor: visual.border
                        }}
                      >
                        {visual.label}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {ping != null ? `${ping}ms` : '—'}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {selectedIds.length === 1 && interfaces.length === 1 && (
            <div className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 font-sans text-[11px] text-muted-foreground">
              💡 <strong>Pro Tip:</strong> Connect your mobile hotspot (via USB or Wi-Fi) or a
              second network adapter to test UnCapped&apos;s dual-channel bonding superpowers.
            </div>
          )}
        </div>

        {/* Test Size Selector */}
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Test Payload Size
          </span>
          <div className="grid grid-cols-3 gap-2">
            {SPEED_OPTIONS.map((option) => {
              const isSelected = selectedSize.id === option.id
              return (
                <button
                  type="button"
                  key={option.id}
                  onClick={() => setSelectedSize(option)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2.5 text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'border-foreground bg-card text-foreground font-semibold shadow-xs ring-1 ring-foreground/20'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <span className="font-mono text-[13px] font-bold leading-tight">
                    {option.label}
                  </span>
                  <span className="font-sans text-[9.5px] text-muted-foreground leading-tight">
                    {option.description}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <DialogClose render={<Button type="button" variant="ghost" size="sm" />}>
            Close
          </DialogClose>
          {benchmarkMode === 'benchmark' ? (
            <Button
              type="button"
              size="sm"
              disabled={
                testing ||
                Boolean(isDownloadActive) ||
                selectedIds.length === 0 ||
                interfaces.length === 0
              }
              onClick={handleRunComparisonBenchmark}
              className="gap-1.5 cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {testing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{benchmarkStatus || 'Benchmarking…'}</span>
                </>
              ) : (
                <>
                  <TrendingUp className="size-3.5" />
                  <span>Run Comparison Proof</span>
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={
                testing ||
                Boolean(isDownloadActive) ||
                selectedIds.length === 0 ||
                interfaces.length === 0
              }
              onClick={handleStartSpeedTest}
              className="gap-1.5 cursor-pointer"
            >
              {testing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Preparing test…</span>
                </>
              ) : (
                <>
                  <Zap className="size-3.5 fill-current" />
                  <span>Run Download Test</span>
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
