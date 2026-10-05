import type { DataCapMode, MeteredMode, NetworkInterfaceKind, SpeedLimitMode } from '@shared/types'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useNetworkVisuals } from '../hooks/useNetworkVisuals'
import { useAppStore } from '../store/useAppStore'
import { NETWORK_COLOR_SWATCHES, type NetworkColorId } from '../theme'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface NetworkEditPopoverProps {
  interfaceId: string
  interfaceKind: NetworkInterfaceKind
  osName: string
}

const fieldLabelClass =
  'font-mono text-[9px] leading-none font-medium tracking-[0.12em] text-muted-foreground uppercase'

const MAX_NETWORK_NAME_LENGTH = 40

/** Rename/recolor one network and set bandwidth & data caps. Edits are a draft that's saved when the popover closes — Done,
 * Enter or clicking away — and thrown away on Escape. */
export function NetworkEditPopover({
  interfaceId,
  interfaceKind,
  osName
}: NetworkEditPopoverProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const preference = useAppStore((store) => store.networkPreferences[interfaceId])
  const setNetworkPreference = useAppStore((store) => store.setNetworkPreference)
  const visual = useNetworkVisuals()(interfaceId, interfaceKind, osName)

  const [draftName, setDraftName] = useState('')
  const [draftColorId, setDraftColorId] = useState<NetworkColorId>(visual.colorId)
  const [draftMeteredMode, setDraftMeteredMode] = useState<MeteredMode>('unmetered')

  const [draftSpeedMode, setDraftSpeedMode] = useState<SpeedLimitMode>('unlimited')
  const [draftSpeedVal, setDraftSpeedVal] = useState<string>('5')
  const [draftSpeedUnit, setDraftSpeedUnit] = useState<'MB/s' | 'KB/s'>('MB/s')

  const [draftDataMode, setDraftDataMode] = useState<DataCapMode>('unlimited')
  const [draftDataVal, setDraftDataVal] = useState<string>('2')
  const [draftDataUnit, setDraftDataUnit] = useState<'GB' | 'MB'>('GB')

  function save(): void {
    const trimmed = draftName.trim().slice(0, MAX_NETWORK_NAME_LENGTH)
    const customName = trimmed && trimmed !== osName ? trimmed : undefined
    // Re-picking the color it already had keeps it automatic instead of pinning it.
    const colorId = draftColorId === visual.colorId ? preference?.colorId : draftColorId
    const meteredMode: MeteredMode = draftMeteredMode

    let speedLimitMode: SpeedLimitMode = 'unlimited'
    let maxSpeedBytesPerSec: number | undefined = undefined
    if (draftSpeedMode === 'capped') {
      const parsed = parseFloat(draftSpeedVal)
      if (!isNaN(parsed) && parsed > 0) {
        speedLimitMode = 'capped'
        maxSpeedBytesPerSec = Math.round(parsed * (draftSpeedUnit === 'MB/s' ? 1024 * 1024 : 1024))
      }
    }

    let dataCapMode: DataCapMode = 'unlimited'
    let maxDataBytes: number | undefined = undefined
    if (draftDataMode === 'capped') {
      const parsed = parseFloat(draftDataVal)
      if (!isNaN(parsed) && parsed > 0) {
        dataCapMode = 'capped'
        maxDataBytes = Math.round(
          parsed * (draftDataUnit === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024)
        )
      }
    }

    void setNetworkPreference(interfaceId, {
      customName,
      colorId,
      meteredMode,
      speedLimitMode,
      maxSpeedBytesPerSec,
      dataCapMode,
      maxDataBytes
    })
  }

  function close(): void {
    save()
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (next) {
          setDraftName(visual.name)
          setDraftColorId(visual.colorId)

          const mMode = preference?.meteredMode ?? 'unmetered'
          setDraftMeteredMode(mMode)

          const sMode = preference?.speedLimitMode ?? 'unlimited'
          setDraftSpeedMode(sMode)
          if (preference?.maxSpeedBytesPerSec && preference.maxSpeedBytesPerSec > 0) {
            if (preference.maxSpeedBytesPerSec >= 1024 * 1024) {
              setDraftSpeedVal(
                String(Math.round((preference.maxSpeedBytesPerSec / (1024 * 1024)) * 10) / 10)
              )
              setDraftSpeedUnit('MB/s')
            } else {
              setDraftSpeedVal(String(Math.round(preference.maxSpeedBytesPerSec / 1024)))
              setDraftSpeedUnit('KB/s')
            }
          } else {
            setDraftSpeedVal('5')
            setDraftSpeedUnit('MB/s')
          }

          const dMode = preference?.dataCapMode ?? 'unlimited'
          setDraftDataMode(dMode)
          if (preference?.maxDataBytes && preference.maxDataBytes > 0) {
            if (preference.maxDataBytes >= 1024 * 1024 * 1024) {
              setDraftDataVal(
                String(Math.round((preference.maxDataBytes / (1024 * 1024 * 1024)) * 10) / 10)
              )
              setDraftDataUnit('GB')
            } else {
              setDraftDataVal(String(Math.round(preference.maxDataBytes / (1024 * 1024))))
              setDraftDataUnit('MB')
            }
          } else {
            setDraftDataVal('2')
            setDraftDataUnit('GB')
          }
        } else if (details.reason !== 'escape-key') {
          save()
        }
        setOpen(next)
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Edit network"
                  className="shrink-0 text-muted-foreground"
                >
                  <Pencil className="size-3" />
                </Button>
              }
            />
          }
        />
        <TooltipContent>Edit network</TooltipContent>
      </Tooltip>
      <PopoverContent aria-label={`Edit ${visual.name}`} className="w-72 gap-3.5 p-3.5">
        <div className="flex flex-col gap-[6px]">
          <label htmlFor={`network-name-${interfaceId}`} className={fieldLabelClass}>
            Name
          </label>
          <input
            id={`network-name-${interfaceId}`}
            type="text"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') close()
            }}
            placeholder={osName}
            maxLength={MAX_NETWORK_NAME_LENGTH}
            autoFocus
            className="rounded-[6px] border border-input bg-background px-[9px] py-1.5 font-sans text-[12px] leading-[1.3] font-medium text-foreground outline-none focus-visible:border-ring"
          />
        </div>

        <div className="flex flex-col gap-[6px]">
          <span className={fieldLabelClass}>Color</span>
          <div className="flex items-center justify-between px-1 py-1">
            {NETWORK_COLOR_SWATCHES.map((swatch) => {
              const isSelected = draftColorId === swatch.id
              return (
                <Tooltip key={swatch.id}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => setDraftColorId(swatch.id)}
                        aria-label={swatch.label}
                        aria-pressed={isSelected}
                        className="size-6 shrink-0 rounded-full border-none p-[2px]"
                      >
                        <span
                          className="block size-full rounded-full"
                          style={{
                            background: swatch.solid,
                            boxShadow: isSelected
                              ? `0 0 0 2px var(--color-popover), 0 0 0 4px ${swatch.solid}`
                              : undefined
                          }}
                        />
                      </button>
                    }
                  />
                  <TooltipContent>{swatch.label}</TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </div>

        {/* Connection Profile Controls */}
        <div className="flex flex-col gap-[6px]">
          <div className="flex items-center justify-between">
            <span className={fieldLabelClass}>Profile</span>
            {draftMeteredMode === 'metered' && (
              <span className="font-mono text-[9.5px] text-amber-500 font-medium">Metered</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-[6px] bg-secondary p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setDraftMeteredMode('unmetered')}
              className={`rounded-[4px] py-1 transition-colors ${
                draftMeteredMode === 'unmetered'
                  ? 'bg-background font-semibold text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setDraftMeteredMode('metered')}
              className={`rounded-[4px] py-1 transition-colors ${
                draftMeteredMode === 'metered'
                  ? 'bg-background font-semibold text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Metered
            </button>
          </div>
          {draftMeteredMode === 'metered' && (
            <p className="font-sans text-[10px] leading-tight text-muted-foreground">
              Metered network runs as{' '}
              <span className="font-semibold text-foreground">unlimited data</span> unless a
              specific cap is set below.
            </p>
          )}
        </div>

        {/* Speed Limit Controls */}
        <div className="flex flex-col gap-[6px]">
          <div className="flex items-center justify-between">
            <span className={fieldLabelClass}>Speed Limit</span>
            {draftSpeedMode === 'capped' && (
              <span className="font-mono text-[9.5px] text-amber-500 font-medium">Throttled</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-[6px] bg-secondary p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setDraftSpeedMode('unlimited')}
              className={`rounded-[4px] py-1 transition-colors ${
                draftSpeedMode === 'unlimited'
                  ? 'bg-background font-semibold text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Unlimited
            </button>
            <button
              type="button"
              onClick={() => setDraftSpeedMode('capped')}
              className={`rounded-[4px] py-1 transition-colors ${
                draftSpeedMode === 'capped'
                  ? 'bg-background font-semibold text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Capped
            </button>
          </div>
          {draftSpeedMode === 'capped' && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min="0.1"
                step="any"
                value={draftSpeedVal}
                onChange={(event) => setDraftSpeedVal(event.target.value)}
                placeholder="5"
                className="w-24 rounded-[6px] border border-input bg-background px-2.5 py-1 font-mono text-[11.5px] text-foreground outline-none focus-visible:border-ring"
              />
              <div className="flex rounded-[5px] border border-input bg-secondary p-0.5 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => setDraftSpeedUnit('MB/s')}
                  className={`px-2 py-0.5 rounded-[3px] transition-colors ${
                    draftSpeedUnit === 'MB/s'
                      ? 'bg-background font-bold text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  MB/s
                </button>
                <button
                  type="button"
                  onClick={() => setDraftSpeedUnit('KB/s')}
                  className={`px-2 py-0.5 rounded-[3px] transition-colors ${
                    draftSpeedUnit === 'KB/s'
                      ? 'bg-background font-bold text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  KB/s
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Data Cap Controls */}
        <div className="flex flex-col gap-[6px]">
          <div className="flex items-center justify-between">
            <span className={fieldLabelClass}>Data Budget</span>
            {draftDataMode === 'capped' && (
              <span className="font-mono text-[9.5px] text-amber-500 font-medium">Cap active</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-[6px] bg-secondary p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setDraftDataMode('unlimited')}
              className={`rounded-[4px] py-1 transition-colors ${
                draftDataMode === 'unlimited'
                  ? 'bg-background font-semibold text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Unlimited
            </button>
            <button
              type="button"
              onClick={() => setDraftDataMode('capped')}
              className={`rounded-[4px] py-1 transition-colors ${
                draftDataMode === 'capped'
                  ? 'bg-background font-semibold text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Capped
            </button>
          </div>
          {draftDataMode === 'unlimited' && (
            <div className="flex items-center gap-1.5 pt-0.5 font-mono text-[10px] text-muted-foreground">
              <span>♾️</span>
              <span>Unlimited data (no transfer cap)</span>
            </div>
          )}
          {draftDataMode === 'capped' && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min="0.1"
                step="any"
                value={draftDataVal}
                onChange={(event) => setDraftDataVal(event.target.value)}
                placeholder="2"
                className="w-24 rounded-[6px] border border-input bg-background px-2.5 py-1 font-mono text-[11.5px] text-foreground outline-none focus-visible:border-ring"
              />
              <div className="flex rounded-[5px] border border-input bg-secondary p-0.5 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => setDraftDataUnit('GB')}
                  className={`px-2 py-0.5 rounded-[3px] transition-colors ${
                    draftDataUnit === 'GB'
                      ? 'bg-background font-bold text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  GB
                </button>
                <button
                  type="button"
                  onClick={() => setDraftDataUnit('MB')}
                  className={`px-2 py-0.5 rounded-[3px] transition-colors ${
                    draftDataUnit === 'MB'
                      ? 'bg-background font-bold text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  MB
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" size="xs" onClick={close}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
