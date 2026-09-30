import { ArrowLeft, Download } from 'lucide-react'
import { ColorBadge } from './ColorBadge'
import { SpeedTestButton } from './SpeedTestButton'
import { LatencyShieldToggle } from './LatencyShieldToggle'
import { ThemeToggle } from './ThemeToggle'
import logoIcon from '../assets/icon.png'

export type TitleBarStatus =
  | { kind: 'none' }
  | { kind: 'combined'; networkCount: number }
  | { kind: 'assembling' }
  | { kind: 'paused'; networkCount: number }
  | { kind: 'offline' }

export interface TitleBarNavButton {
  label: string
  icon: 'download' | 'arrow'
  onClick: () => void
  badge?: number | string
}

const isMac = window.plexo.platform === 'darwin'

const pillClass =
  'h-auto flex items-center gap-[7px] rounded-full px-2.5 py-1 font-mono text-[10px] leading-none font-semibold tracking-[0.08em] uppercase whitespace-nowrap'
const pillDotClass = 'size-1.5 shrink-0 rounded-full'

export function TitleBar({
  status,
  navButton,
  onBack,
  onNavigateHome
}: {
  status: TitleBarStatus
  navButton?: TitleBarNavButton
  onBack?: () => void
  onNavigateHome?: () => void
}): React.JSX.Element {
  const dimmed = status.kind === 'offline'

  return (
    <div
      className={`flex h-11 shrink-0 items-center gap-[13px] border-b-[0.5px] border-border bg-card pr-3.5 [-webkit-app-region:drag] ${
        // Real traffic lights are inset here on macOS (see main/index.ts, trafficLightPosition) —
        // 16px inset + ~52px cluster width + a clear ~26px gap before our own content starts.
        isMac ? 'pl-[94px]' : 'pl-3.5'
      }`}
    >
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onNavigateHome}
          className={`flex items-center gap-2 font-sans text-[13px] leading-none font-bold tracking-[-0.02em] shrink-0 hover:opacity-80 transition-opacity [-webkit-app-region:no-drag] cursor-pointer ${
            dimmed ? 'text-muted-foreground' : 'text-foreground'
          }`}
          title="Home"
        >
          <img src={logoIcon} alt="UnCapped" className="size-4.5 rounded-sm object-contain" />
          <span>UnCapped</span>
        </button>
        {navButton ? (
          <button
            type="button"
            onClick={navButton.onClick}
            className="flex items-center gap-1.5 rounded-[5px] px-2 py-1 font-mono text-[10.5px] sm:text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors [-webkit-app-region:no-drag] cursor-pointer shrink-0"
          >
            {navButton.icon === 'download' ? (
              <Download className="size-3.5" />
            ) : (
              <ArrowLeft className="size-3.5" />
            )}
            <span>{navButton.label}</span>
            {navButton.badge != null && (
              <span className="ml-0.5 rounded-full bg-muted-foreground/15 px-1.5 py-0.2 font-mono text-[9.5px] font-semibold text-foreground/80">
                {navButton.badge}
              </span>
            )}
          </button>
        ) : onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-[5px] px-2 py-1 font-mono text-[10.5px] sm:text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors [-webkit-app-region:no-drag] cursor-pointer shrink-0"
          >
            <Download className="size-3.5" />
            <span>Downloads</span>
          </button>
        ) : null}
      </div>
      <div className="flex-1 min-w-2" />
      {status.kind === 'combined' && (
        <ColorBadge
          bg="var(--color-wifi-bg)"
          border="var(--color-wifi-border)"
          text="var(--color-wifi-text)"
          className={pillClass}
        >
          <div
            className={`${pillDotClass} bg-[var(--color-wifi)] animate-[plexo-glow_2s_ease-in-out_infinite]`}
          />
          {status.networkCount} {status.networkCount === 1 ? 'network' : 'networks'} combined
        </ColorBadge>
      )}
      {status.kind === 'assembling' && (
        <ColorBadge
          bg="var(--color-ethernet-bg)"
          border="var(--color-ethernet-border)"
          text="var(--color-ethernet-text)"
          className={pillClass}
        >
          <div
            className={`${pillDotClass} bg-[var(--color-ethernet)] animate-[plexo-glow_1s_ease-in-out_infinite]`}
          />
          Assembling file…
        </ColorBadge>
      )}
      {status.kind === 'paused' && (
        <ColorBadge
          bg="var(--color-usb-bg)"
          border="var(--color-usb-border)"
          text="var(--color-usb-text)"
          className={pillClass}
        >
          <div className={`${pillDotClass} bg-[var(--color-usb)]`} />
          {status.networkCount} {status.networkCount === 1 ? 'network' : 'networks'} · Paused
        </ColorBadge>
      )}
      {status.kind === 'offline' && (
        <ColorBadge
          bg="var(--color-danger-bg)"
          border="var(--color-danger-border)"
          text="var(--color-danger)"
          className={pillClass}
        >
          <div className={`${pillDotClass} bg-[var(--color-danger)]`} />
          Offline
        </ColorBadge>
      )}
      <LatencyShieldToggle />
      <SpeedTestButton />
      <ThemeToggle />
    </div>
  )
}
