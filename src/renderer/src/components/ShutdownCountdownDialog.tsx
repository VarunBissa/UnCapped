import { useEffect, useState } from 'react'
import { AlertTriangle, Power, X } from 'lucide-react'
import { Button } from './ui/button'

export function ShutdownCountdownDialog(): React.JSX.Element | null {
  const [countdown, setCountdown] = useState<{
    remainingSeconds: number
    action: string
  } | null>(null)

  useEffect(() => {
    if (!window.plexo?.onShutdownCountdown) return
    const cleanup = window.plexo.onShutdownCountdown((payload) => {
      setCountdown(payload)
    })
    return cleanup
  }, [])

  if (!countdown || countdown.remainingSeconds <= 0) return null

  const handleCancel = async (): Promise<void> => {
    try {
      await window.plexo.cancelShutdown()
    } catch {
      // ignore
    }
    setCountdown(null)
  }

  const isSleep = countdown.action === 'sleep'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-destructive/40 bg-card p-6 shadow-2xl space-y-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15 text-destructive ring-8 ring-destructive/10 animate-pulse">
          {isSleep ? <Power className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {isSleep ? 'Entering Sleep Mode' : 'Computer Shutting Down'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Download completed! Scheduled system action will execute automatically in:
          </p>
        </div>

        <div className="py-2">
          <div className="inline-flex items-baseline gap-1 text-5xl font-extrabold font-mono tracking-wider text-destructive">
            <span>{countdown.remainingSeconds}</span>
            <span className="text-lg font-normal text-muted-foreground">s</span>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            variant="destructive"
            size="lg"
            className="w-full font-semibold gap-2 shadow-lg"
            onClick={handleCancel}
          >
            <X className="h-5 w-5" />
            Cancel {isSleep ? 'Sleep' : 'Shutdown'}
          </Button>
        </div>
      </div>
    </div>
  )
}
