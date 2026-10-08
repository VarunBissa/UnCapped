import { useEffect, useRef, useState, type FC } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

export const ZoomIndicator: FC = () => {
  const [zoomFactor, setZoomFactor] = useState<number | null>(null)
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isFirstEvent = useRef(true)

  useEffect(() => {
    if (!window.uncapped?.onZoomChanged) return

    const unsubscribe = window.uncapped.onZoomChanged((factor: number) => {
      // Skip the very first event on load so we don't flash a badge on app launch
      if (isFirstEvent.current) {
        isFirstEvent.current = false
        return
      }

      setZoomFactor(factor)
      setVisible(true)

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        setVisible(false)
        timeoutRef.current = null
      }, 1500)
    })

    return () => {
      unsubscribe()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  if (!visible || zoomFactor === null) return null

  const percent = Math.round(zoomFactor * 100)
  const isDefault = percent === 100

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none select-none transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="flex items-center gap-2 rounded-full border border-border/80 bg-card/95 px-3.5 py-1.5 shadow-xl backdrop-blur-md">
        {isDefault ? (
          <RotateCcw className="size-3.5 text-muted-foreground" />
        ) : percent > 100 ? (
          <ZoomIn className="size-3.5 text-primary" />
        ) : (
          <ZoomOut className="size-3.5 text-primary" />
        )}
        <span className="font-mono text-xs font-semibold tracking-wide text-foreground">
          {percent}%
        </span>
      </div>
    </div>
  )
}
