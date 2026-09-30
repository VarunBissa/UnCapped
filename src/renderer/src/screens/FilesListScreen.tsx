import type { DownloadState, DownloadStatus } from '@shared/types'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from 'cn'
import { ColorBadge } from '../components/ColorBadge'
import { Button, buttonVariants } from '../components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../components/ui/alert-dialog'
import { KIND_PALETTE } from '../theme'
import {
  dirnameOf,
  fileExtensionBadge,
  formatBytes,
  formatSpeed,
  toDisplayPath
} from '../utils/format'
import { useAppStore } from '../store/useAppStore'
import { toast } from '../store/useToastStore'

const PAGE_SIZE = 10

function getStatusBadge(status: DownloadStatus): {
  label: string
  bg: string
  border: string
  text: string
} {
  switch (status) {
    case 'downloading':
      return {
        label: 'DOWNLOADING',
        bg: KIND_PALETTE.wifi.bg,
        border: KIND_PALETTE.wifi.border,
        text: KIND_PALETTE.wifi.text
      }
    case 'assembling':
      return {
        label: 'ASSEMBLING',
        bg: KIND_PALETTE.ethernet.bg,
        border: KIND_PALETTE.ethernet.border,
        text: KIND_PALETTE.ethernet.text
      }
    case 'paused':
      return {
        label: 'PAUSED',
        bg: KIND_PALETTE.usb.bg,
        border: KIND_PALETTE.usb.border,
        text: KIND_PALETTE.usb.text
      }
    case 'completed':
      return {
        label: 'COMPLETED',
        bg: KIND_PALETTE.ethernet.bg,
        border: KIND_PALETTE.ethernet.border,
        text: KIND_PALETTE.ethernet.text
      }
    case 'error':
    case 'cancelled':
      return {
        label: status.toUpperCase(),
        bg: KIND_PALETTE.other.bg,
        border: KIND_PALETTE.other.border,
        text: KIND_PALETTE.other.text
      }
  }
}

export function FilesListScreen({
  downloads,
  onSelectFile,
  onNewDownload
}: {
  downloads: DownloadState[]
  onSelectFile: (download: DownloadState) => void
  onNewDownload: () => void
}): React.JSX.Element {
  const homeDir = useAppStore((store) => store.homeDir)
  const removeDownloadFromList = useAppStore((store) => store.removeDownloadFromList)
  const updateDownloadStatus = useAppStore((store) => store.updateDownloadStatus)

  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [category, setCategory] = useState<'all' | 'active' | 'completed' | 'cancelled'>(() =>
    downloads.some(
      (d) => d.status === 'downloading' || d.status === 'assembling' || d.status === 'paused'
    )
      ? 'active'
      : 'all'
  )

  const counts = useMemo(() => {
    return {
      all: downloads.length,
      active: downloads.filter(
        (d) => d.status === 'downloading' || d.status === 'assembling' || d.status === 'paused'
      ).length,
      completed: downloads.filter((d) => d.status === 'completed').length,
      cancelled: downloads.filter((d) => d.status === 'cancelled' || d.status === 'error').length
    }
  }, [downloads])

  const handleDownloadAgain = (item: DownloadState): void => {
    void window.plexo.removeDownload(item.id)
    removeDownloadFromList(item.id)
    useAppStore.getState().setDraftUrl(item.url)
    useAppStore.getState().setActiveView('idle')
  }

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    download: DownloadState
  } | null>(null)
  const [downloadToRemove, setDownloadToRemove] = useState<DownloadState | null>(null)

  useEffect(() => {
    const handleDismiss = (): void => setContextMenu(null)
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('click', handleDismiss)
    window.addEventListener('contextmenu', handleDismiss)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', handleDismiss)
      window.removeEventListener('contextmenu', handleDismiss)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const filteredDownloads = useMemo(() => {
    let list = downloads
    if (category === 'active') {
      list = list.filter(
        (d) => d.status === 'downloading' || d.status === 'assembling' || d.status === 'paused'
      )
    } else if (category === 'completed') {
      list = list.filter((d) => d.status === 'completed')
    } else if (category === 'cancelled') {
      list = list.filter((d) => d.status === 'cancelled' || d.status === 'error')
    }

    const query = searchQuery.trim().toLowerCase()
    if (query) {
      list = list.filter(
        (item) =>
          item.fileName.toLowerCase().includes(query) || item.status.toLowerCase().includes(query)
      )
    }

    // Always sort in-progress downloads first, then by most recently started
    return [...list].sort((a, b) => {
      const aActive =
        a.status === 'downloading' || a.status === 'assembling' || a.status === 'paused'
      const bActive =
        b.status === 'downloading' || b.status === 'assembling' || b.status === 'paused'
      if (aActive && !bActive) return -1
      if (!aActive && bActive) return 1
      return (b.startedAt || 0) - (a.startedAt || 0)
    })
  }, [downloads, category, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredDownloads.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE
  const paginatedDownloads = filteredDownloads.slice(startIndex, startIndex + PAGE_SIZE)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      {/* Top Header / Action Bar */}
      <div className="shrink-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 sm:gap-3 border-b border-border/80 px-4 sm:px-5 py-3 bg-card/40">
        <div className="flex items-center gap-2.5">
          <h1 className="font-sans text-[15px] font-bold tracking-tight text-foreground">
            All Files
          </h1>
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10.5px] font-medium text-muted-foreground">
            {filteredDownloads.length} {filteredDownloads.length === 1 ? 'file' : 'files'}
          </span>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Search Bar */}
          <div className="flex h-8 flex-1 sm:w-56 md:w-64 items-center gap-2 rounded-[7px] border border-input bg-[var(--input-bg)] px-2.5">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Filter files..."
              className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* New Download Button */}
          <Button
            type="button"
            size="sm"
            onClick={onNewDownload}
            className="h-8 shrink-0 gap-1.5 font-mono text-[11px] tracking-wide"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">New Download</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {/* Category Filter Pills & Batch Toolbar */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-5 py-2 border-b border-border/60 bg-muted/20">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {(
            [
              { id: 'all', label: 'All', count: counts.all },
              { id: 'active', label: 'In Progress', count: counts.active },
              { id: 'completed', label: 'Completed', count: counts.completed },
              { id: 'cancelled', label: 'Cancelled', count: counts.cancelled }
            ] as const
          ).map((tab) => {
            const isActive = category === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCategory(tab.id)
                  setCurrentPage(1)
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 font-mono text-[11px] transition-all cursor-pointer whitespace-nowrap',
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[9.5px]',
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {counts.completed > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              const completedIds = downloads
                .filter((d) => d.status === 'completed')
                .map((d) => d.id)
              for (const id of completedIds) {
                removeDownloadFromList(id)
              }
              toast.info(
                'Completed Cleared',
                `Cleared ${completedIds.length} completed download${completedIds.length === 1 ? '' : 's'}`
              )
            }}
            className="h-6 font-mono text-[10px] text-muted-foreground hover:text-foreground px-2"
          >
            Clear Completed
          </Button>
        )}
      </div>

      {/* Main Files Table */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
        {paginatedDownloads.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3.5 p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border/80 bg-muted/50 text-muted-foreground">
              {searchQuery ? <Search className="size-6" /> : <Download className="size-6" />}
            </div>
            <div className="flex flex-col gap-1 max-w-sm">
              <div className="font-sans text-[15px] font-semibold text-foreground">
                {searchQuery ? 'No files match your search' : 'No downloads yet'}
              </div>
              <div className="font-mono text-[11.5px] text-muted-foreground">
                {searchQuery
                  ? `No downloads found matching "${searchQuery}".`
                  : 'Start your first download by pasting a link or magnet URL.'}
              </div>
            </div>
            {!searchQuery && (
              <Button
                type="button"
                size="sm"
                onClick={onNewDownload}
                className="mt-1 gap-1.5 font-mono text-[11px] tracking-wide"
              >
                <Plus className="size-3.5" />
                <span>Start New Download</span>
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full min-w-[580px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <th className="py-2.5 pl-4 sm:pl-5 pr-3">File Name</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Progress</th>
                <th className="py-2.5 px-3 text-right">Speed</th>
                <th className="py-2.5 pr-4 sm:pr-5 pl-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {paginatedDownloads.map((item) => {
                const badge = getStatusBadge(item.status)
                const percent =
                  item.totalBytes > 0
                    ? Math.min(100, Math.round((item.bytesDownloaded / item.totalBytes) * 100))
                    : item.status === 'completed'
                      ? 100
                      : 0

                return (
                  <tr
                    key={item.id}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const menuWidth = 190
                      const menuHeight = 220
                      const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10)
                      const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10)
                      setContextMenu({ x, y, download: item })
                    }}
                    className="group transition-colors hover:bg-muted/40"
                  >
                    {/* File Name Column */}
                    <td className="py-2.5 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-border/80 bg-card font-mono text-[9px] font-bold text-muted-foreground">
                          {fileExtensionBadge(item.fileName)}
                        </div>
                        <div className="min-w-0 max-w-md">
                          <button
                            type="button"
                            onClick={() => onSelectFile(item)}
                            title="Click to view detailed download page"
                            className="text-left font-sans text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors hover:underline cursor-pointer truncate block w-full"
                          >
                            {item.fileName}
                          </button>
                          <div className="truncate font-mono text-[10.5px] text-muted-foreground/80">
                            {toDisplayPath(dirnameOf(item.destinationPath), homeDir)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status Badge Column */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <ColorBadge
                        bg={badge.bg}
                        border={badge.border}
                        text={badge.text}
                        className="rounded-[4px] px-2 py-0.5 font-mono text-[9px] font-semibold tracking-wider"
                      >
                        {badge.label}
                      </ColorBadge>
                    </td>

                    {/* Progress Column */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="w-36 flex flex-col gap-1">
                        <div className="flex items-center justify-between font-mono text-[10.5px] tabular-nums text-muted-foreground">
                          <span>{formatBytes(item.bytesDownloaded)}</span>
                          <span className="font-semibold text-foreground">{percent}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary transition-all duration-300 rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Speed Column */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-right font-mono text-[11.5px] tabular-nums font-medium text-foreground">
                      {item.status === 'downloading' && item.speedBytesPerSec > 0 ? (
                        formatSpeed(item.speedBytesPerSec)
                      ) : item.status === 'completed' ? (
                        <span className="text-muted-foreground text-[10.5px]">Done</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Actions Column */}
                    <td className="py-2.5 pr-4 sm:pr-5 pl-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {(item.status === 'downloading' || item.status === 'assembling') && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  onClick={() => {
                                    void window.plexo.pauseDownload(item.id)
                                    updateDownloadStatus(item.id, 'paused')
                                  }}
                                  className="h-7 px-2 font-mono text-[10px] text-foreground hover:bg-muted"
                                >
                                  <Pause className="size-3 mr-1" />
                                  Pause
                                </Button>
                              }
                            />
                            <TooltipContent>Pause download</TooltipContent>
                          </Tooltip>
                        )}

                        {item.status === 'paused' && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="default"
                                  size="xs"
                                  onClick={() => {
                                    void window.plexo.resumeDownload(item.id)
                                    updateDownloadStatus(item.id, 'downloading')
                                  }}
                                  className="h-7 px-2 font-mono text-[10px]"
                                >
                                  <Play className="size-3 mr-1" />
                                  Resume
                                </Button>
                              }
                            />
                            <TooltipContent>Resume download</TooltipContent>
                          </Tooltip>
                        )}

                        {(item.status === 'cancelled' || item.status === 'error') && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="xs"
                                  onClick={() => handleDownloadAgain(item)}
                                  className="h-7 px-2 font-mono text-[10px] text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                                >
                                  <RotateCcw className="size-3 mr-1" />
                                  Download Again
                                </Button>
                              }
                            />
                            <TooltipContent>Restart this download</TooltipContent>
                          </Tooltip>
                        )}

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => onSelectFile(item)}
                                className="h-7 px-2 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLink className="size-3 mr-1" />
                                Details
                              </Button>
                            }
                          />
                          <TooltipContent>View complete download details</TooltipContent>
                        </Tooltip>

                        {Boolean(item.destinationPath) && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => {
                                    const dir = dirnameOf(item.destinationPath)
                                    const pathToReveal =
                                      item.destinationPath &&
                                      !item.destinationPath.endsWith(item.fileName) &&
                                      dir !== '.'
                                        ? `${dir.replace(/[\\/]$/, '')}/${item.fileName}`
                                        : item.destinationPath
                                    void window.plexo.revealInFolder(pathToReveal)
                                  }}
                                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                >
                                  <FolderOpen className="size-3.5" />
                                </Button>
                              }
                            />
                            <TooltipContent>Show in folder</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer - Exactly 10 items per page */}
      <div className="shrink-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 border-t border-border px-4 sm:px-5 py-2.5 bg-card/40 font-mono text-[11px] text-muted-foreground">
        <div>
          {filteredDownloads.length > 0 ? (
            <span>
              Showing <span className="font-semibold text-foreground">{startIndex + 1}</span>–
              <span className="font-semibold text-foreground">
                {Math.min(startIndex + PAGE_SIZE, filteredDownloads.length)}
              </span>{' '}
              of <span className="font-semibold text-foreground">{filteredDownloads.length}</span>{' '}
              files
            </span>
          ) : (
            <span>0 files</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safeCurrentPage <= 1}
            className="h-7 gap-1 font-mono text-[10.5px]"
          >
            <ChevronLeft className="size-3.5" />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          <span className="px-1.5 sm:px-2 font-mono text-[10.5px] sm:text-[11px] font-medium text-foreground whitespace-nowrap">
            Page {safeCurrentPage} of {totalPages}
          </span>

          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safeCurrentPage >= totalPages}
            className="h-7 gap-1 font-mono text-[10.5px]"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          role="menu"
          aria-label="Download options"
          className="fixed z-50 min-w-[190px] overflow-hidden rounded-[8px] border border-border bg-card p-1 shadow-2xl animate-in fade-in-80 zoom-in-95 duration-100 font-sans"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1.5 border-b border-border/60 font-mono text-[10.5px] text-muted-foreground truncate max-w-[210px]">
            {contextMenu.download.fileName}
          </div>

          <div className="p-0.5 flex flex-col gap-0.5 mt-0.5">
            {/* Stop / Pause (if downloading or assembling) */}
            {(contextMenu.download.status === 'downloading' ||
              contextMenu.download.status === 'assembling') && (
              <button
                type="button"
                onClick={() => {
                  void window.plexo.pauseDownload(contextMenu.download.id)
                  updateDownloadStatus(contextMenu.download.id, 'paused')
                  setContextMenu(null)
                }}
                className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors text-left cursor-pointer"
              >
                <Pause className="size-3.5 text-muted-foreground" />
                <span>Stop / Pause</span>
              </button>
            )}

            {/* Start / Resume / Download Again (if paused, error, or cancelled) */}
            {(contextMenu.download.status === 'paused' ||
              contextMenu.download.status === 'error' ||
              contextMenu.download.status === 'cancelled') && (
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.download.status === 'cancelled') {
                    handleDownloadAgain(contextMenu.download)
                  } else {
                    void window.plexo.resumeDownload(contextMenu.download.id)
                    updateDownloadStatus(contextMenu.download.id, 'downloading')
                  }
                  setContextMenu(null)
                }}
                className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors text-left cursor-pointer"
              >
                {contextMenu.download.status === 'cancelled' ? (
                  <>
                    <RotateCcw className="size-3.5 text-muted-foreground" />
                    <span>Download Again</span>
                  </>
                ) : (
                  <>
                    <Play className="size-3.5 text-muted-foreground" />
                    <span>Start / Resume</span>
                  </>
                )}
              </button>
            )}

            {/* View Details */}
            <button
              type="button"
              onClick={() => {
                onSelectFile(contextMenu.download)
                setContextMenu(null)
              }}
              className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors text-left cursor-pointer"
            >
              <ExternalLink className="size-3.5 text-muted-foreground" />
              <span>View Details</span>
            </button>

            {/* Show in Folder (if destinationPath exists) */}
            {contextMenu.download.destinationPath && (
              <button
                type="button"
                onClick={() => {
                  const dir = dirnameOf(contextMenu.download.destinationPath)
                  const pathToReveal =
                    contextMenu.download.destinationPath &&
                    !contextMenu.download.destinationPath.endsWith(contextMenu.download.fileName) &&
                    dir !== '.'
                      ? `${dir.replace(/[\\/]$/, '')}/${contextMenu.download.fileName}`
                      : contextMenu.download.destinationPath
                  void window.plexo.revealInFolder(pathToReveal)
                  setContextMenu(null)
                }}
                className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors text-left cursor-pointer"
              >
                <FolderOpen className="size-3.5 text-muted-foreground" />
                <span>Show in Folder</span>
              </button>
            )}

            {/* Copy Download Link */}
            {contextMenu.download.url && (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(contextMenu.download.url)
                  toast.success('Link Copied', 'Download URL copied to clipboard')
                  setContextMenu(null)
                }}
                className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors text-left cursor-pointer"
              >
                <Copy className="size-3.5 text-muted-foreground" />
                <span>Copy Download Link</span>
              </button>
            )}

            <div className="my-1 h-px bg-border/60" />

            {/* Delete file */}
            <button
              type="button"
              onClick={() => {
                const target = contextMenu.download
                setContextMenu(null)
                setDownloadToRemove(target)
              }}
              className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[12px] font-medium text-destructive hover:bg-destructive/10 transition-colors text-left cursor-pointer"
            >
              <Trash2 className="size-3.5" />
              <span>Delete file</span>
            </button>
          </div>
        </div>
      )}

      {/* Delete / Move to Recycle Bin Confirmation Dialog */}
      {downloadToRemove && (
        <AlertDialog
          open={Boolean(downloadToRemove)}
          onOpenChange={(open) => !open && setDownloadToRemove(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete file and move to Recycle Bin?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{downloadToRemove.fileName}&quot;?
                {downloadToRemove.status === 'downloading'
                  ? ' The active download will be cancelled, and the'
                  : ' The'}{' '}
                file will be moved to the Recycle Bin and removed from your downloads.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDownloadToRemove(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: 'destructive', size: 'sm' })}
                onClick={() => {
                  void window.plexo.deleteDownload(
                    downloadToRemove.id,
                    downloadToRemove.destinationPath,
                    false,
                    downloadToRemove.fileName
                  )
                  removeDownloadFromList(downloadToRemove.id)
                  toast.info('File Deleted', `"${downloadToRemove.fileName}" was removed`)
                  setDownloadToRemove(null)
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
