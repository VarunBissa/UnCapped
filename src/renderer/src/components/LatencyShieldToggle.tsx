import { Shield, ShieldCheck } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export function LatencyShieldToggle(): React.JSX.Element {
  const latencyShieldEnabled = useAppStore((s) => s.latencyShieldEnabled)
  const toggleLatencyShield = useAppStore((s) => s.toggleLatencyShield)
  const interfaces = useAppStore((s) => s.interfaces)
  const currentDownload = useAppStore((s) => s.currentDownload)

  const shieldedInterfaceName =
    currentDownload?.shieldedInterfaceId &&
    interfaces.find((i) => i.id === currentDownload.shieldedInterfaceId)?.displayName

  return (
    <button
      type="button"
      onClick={() => void toggleLatencyShield()}
      className={`group relative flex h-7 items-center gap-1.5 rounded-[min(var(--radius-md),12px)] px-2.5 font-mono text-[10.5px] font-semibold tracking-wide uppercase transition-all duration-200 cursor-pointer [-webkit-app-region:no-drag] select-none ${
        latencyShieldEnabled
          ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)] hover:bg-emerald-500/15 hover:border-emerald-500/60'
          : 'border border-border/80 bg-muted/30 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
      }`}
      title={
        latencyShieldEnabled
          ? `Gaming / Latency Shield: ACTIVE.\nBulk downloads are evacuated from your low-latency connection ${
              shieldedInterfaceName ? `(${shieldedInterfaceName}) ` : ''
            }to eliminate ping spikes and bufferbloat.`
          : 'Gaming / Latency Shield: OFF.\nClick to isolate ping-sensitive gaming traffic on your primary link.'
      }
    >
      {latencyShieldEnabled ? (
        <>
          <div className="size-1.5 shrink-0 rounded-full bg-emerald-400 animate-[plexo-glow_1.5s_ease-in-out_infinite]" />
          <ShieldCheck className="size-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Shield ON</span>
          <span className="sm:hidden">Shield</span>
        </>
      ) : (
        <>
          <Shield className="size-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
          <span>Shield</span>
        </>
      )}
    </button>
  )
}
