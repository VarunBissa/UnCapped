import { FC, type JSX } from 'react'
import { AlertTriangle, CheckCircle2, Info, Network, Wifi, X, XCircle } from 'lucide-react'
import { useToastStore, type ToastItem } from '../store/useToastStore'

export const ToastContainer: FC = () => {
  const toasts = useToastStore((state) => state.toasts)
  const dismissToast = useToastStore((state) => state.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2.5 max-w-[340px] pointer-events-none select-none"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
      ))}
    </div>
  )
}

const ToastCard: FC<{ toast: ToastItem; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const getIcon = (): JSX.Element => {
    switch (toast.type) {
      case 'success':
        return (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        )
      case 'warning':
        return (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AlertTriangle className="h-4 w-4" />
          </div>
        )
      case 'error':
        return (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">
            <XCircle className="h-4 w-4" />
          </div>
        )
      case 'network':
        return (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0e4a8e]/10 text-[#0e4a8e] dark:bg-[#3b82f6]/15 dark:text-[#3b82f6] border border-[#0e4a8e]/20 dark:border-[#3b82f6]/30">
            {toast.networkKind === 'wifi' ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <Network className="h-4 w-4" />
            )}
          </div>
        )
      case 'info':
      default:
        return (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0e4a8e]/10 text-[#0e4a8e] dark:bg-[#3b82f6]/15 dark:text-[#3b82f6] border border-[#0e4a8e]/20 dark:border-[#3b82f6]/30">
            <Info className="h-4 w-4" />
          </div>
        )
    }
  }

  return (
    <div className="pointer-events-auto flex items-start gap-2.5 w-full p-3 rounded-xl bg-card/95 border border-border shadow-xl backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-2">
      {getIcon()}
      <div className="flex-1 min-w-0 pr-1">
        <h4 className="text-xs font-semibold text-foreground leading-tight truncate">
          {toast.title}
        </h4>
        {toast.message && (
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug break-words">
            {toast.message}
          </p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick()
              onDismiss()
            }}
            className="mt-1.5 inline-flex items-center text-[11px] font-medium text-primary hover:underline cursor-pointer"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Close notification"
        className="shrink-0 p-1 text-muted-foreground/60 hover:text-foreground rounded transition-colors cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
