import { useEffect } from 'react'
import {
  DownloadIcon,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog'
import { Button } from './ui/button'
import { formatBytes, formatSpeed } from '../utils/format'

export function UpdateDialog(): React.JSX.Element | null {
  const availableUpdate = useAppStore((store) => store.availableUpdate)
  const dismissUpdate = useAppStore((store) => store.dismissUpdate)
  const appUpdateStatus = useAppStore((store) => store.appUpdateStatus)
  const updateProgress = useAppStore((store) => store.updateProgress)
  const startUpdateDownload = useAppStore((store) => store.startUpdateDownload)
  const installUpdateAndRestart = useAppStore((store) => store.installUpdateAndRestart)

  useEffect(() => {
    if (!window.uncapped?.onUpdateProgress) return

    const unsubProgress = window.uncapped.onUpdateProgress((progress) => {
      useAppStore.setState({
        updateProgress: progress,
        appUpdateStatus: progress.percent >= 100 ? 'ready' : 'downloading'
      })
    })

    const unsubDownloaded = window.uncapped.onUpdateDownloaded?.(() => {
      useAppStore.setState({ appUpdateStatus: 'ready' })
    })

    return () => {
      unsubProgress?.()
      unsubDownloaded?.()
    }
  }, [])

  if (!availableUpdate || availableUpdate.dismissed) return null

  const isDownloading = appUpdateStatus === 'downloading'
  const isReady = appUpdateStatus === 'ready'
  const isError = appUpdateStatus === 'error'

  return (
    <AlertDialog
      open={!availableUpdate.dismissed}
      onOpenChange={(open) => {
        if (!open && !isDownloading) dismissUpdate()
      }}
    >
      <AlertDialogContent className="sm:max-w-md p-6 gap-4">
        <AlertDialogHeader className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="size-4" />
            </div>
            <span className="font-mono text-xs font-semibold text-primary uppercase tracking-wider">
              New Version Available
            </span>
          </div>
          <AlertDialogTitle className="font-sans text-lg font-bold tracking-tight text-foreground">
            UnCapped v{availableUpdate.version}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground">
            {isReady
              ? 'The update has been downloaded and is ready to install.'
              : isDownloading
                ? 'Downloading the update package in the background…'
                : 'A new version with the latest features, speed improvements, and fixes is available.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Live In-App Download Progress */}
        {isDownloading && updateProgress && (
          <div className="space-y-2 rounded-xl border border-border/80 bg-secondary/30 p-3.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-foreground">{updateProgress.percent}%</span>
              <span className="text-muted-foreground">
                {updateProgress.bytesPerSecond > 0 &&
                  `${formatSpeed(updateProgress.bytesPerSecond)} · `}
                {formatBytes(updateProgress.transferred)} / {formatBytes(updateProgress.total)}
              </span>
            </div>
            {/* Progress Track */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(4, updateProgress.percent)}%` }}
              />
            </div>
          </div>
        )}

        {/* Ready to Install Notice */}
        {isReady && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-400">
            <CheckCircle2 className="size-5 shrink-0" />
            <span className="text-xs font-medium">
              Update downloaded successfully. Restart UnCapped now to apply.
            </span>
          </div>
        )}

        {/* Error Notice */}
        {isError && (
          <div className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive">
            <AlertCircle className="size-5 shrink-0" />
            <span className="text-xs font-medium">
              In-app download encountered an error. You can try again or download from GitHub.
            </span>
          </div>
        )}

        {/* Release Notes Preview */}
        {availableUpdate.releaseNotes && !isDownloading && !isReady && (
          <div className="max-h-28 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[11.5px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-sans">
            {availableUpdate.releaseNotes}
          </div>
        )}

        <AlertDialogFooter className="flex-col sm:flex-row gap-2 pt-1">
          {!isDownloading && (
            <AlertDialogCancel onClick={dismissUpdate} className="cursor-pointer">
              Not now
            </AlertDialogCancel>
          )}

          {/* Action Button: Download in App vs Restart */}
          {isReady ? (
            <Button
              type="button"
              size="sm"
              onClick={installUpdateAndRestart}
              className="gap-1.5 cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
            >
              <RotateCcw className="size-3.5" />
              <span>Restart & Install Now</span>
            </Button>
          ) : isDownloading ? (
            <Button type="button" size="sm" disabled className="gap-1.5 font-medium">
              <DownloadIcon className="size-3.5 animate-pulse" />
              <span>Downloading…</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => void startUpdateDownload()}
              className="gap-1.5 cursor-pointer font-medium"
            >
              <DownloadIcon className="size-3.5" />
              <span>Update Through App</span>
            </Button>
          )}

          {!isDownloading && !isReady && (
            <a
              href={availableUpdate.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1 sm:ml-auto"
              title="Open release page in web browser"
            >
              <span>Release Notes</span>
              <ExternalLink className="size-3" />
            </a>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
