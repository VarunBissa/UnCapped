import { useState } from 'react'
import { ClipboardPaste, Link2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from './ui/dialog'
import { Button } from './ui/button'

interface UpdateLinkDialogProps {
  downloadId: string
  currentUrl: string
  fileName: string
}

export function UpdateLinkDialog({
  downloadId,
  fileName
}: UpdateLinkDialogProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePaste = async (): Promise<void> => {
    try {
      const text = await window.uncapped.readClipboardText()
      if (text.trim()) {
        setNewUrl(text.trim())
        setError(null)
      }
    } catch {
      // ignore
    }
  }

  const handleUpdate = async (): Promise<void> => {
    const trimmed = newUrl.trim()
    if (!trimmed) {
      setError('Please enter a valid download link.')
      return
    }
    if (!/^https?:\/\//i.test(trimmed) && !/^magnet:\?/i.test(trimmed)) {
      setError('URL must begin with http://, https://, or magnet:?')
      return
    }

    setUpdating(true)
    setError(null)
    try {
      if (typeof window.uncapped.updateDownloadUrl !== 'function') {
        throw new Error(
          'App update pending: Please restart UnCapped (press Ctrl+C in the terminal and run npm run dev) to load the new link updater.'
        )
      }
      const success = await window.uncapped.updateDownloadUrl(downloadId, trimmed)
      if (success) {
        setOpen(false)
        setNewUrl('')
      } else {
        setError('Failed to update download link.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="flex items-center gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/60"
            title="Update or refresh the download link if expired (HTTP 403)"
          >
            <Link2 className="size-3.5" />
            <span>Update Link</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-amber-500" />
            Update Download Link
          </DialogTitle>
          <DialogDescription>
            Temporary download links (like dlproxy / cloud hosts) expire after 1–2 hours. Paste a
            fresh link for <span className="font-semibold text-foreground">{fileName}</span> to
            continue seamlessly without losing your downloaded progress.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2.5 py-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newUrl}
              onChange={(e) => {
                setNewUrl(e.target.value)
                setError(null)
              }}
              placeholder="Paste new download URL here…"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              autoFocus
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handlePaste}
              title="Paste from clipboard"
              className="shrink-0 gap-1 px-2.5"
            >
              <ClipboardPaste className="size-3.5" />
              <span>Paste</span>
            </Button>
          </div>
          {error && <div className="font-sans text-xs font-medium text-destructive">{error}</div>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={updating}>
            Cancel
          </Button>
          <Button type="button" onClick={handleUpdate} disabled={updating || !newUrl.trim()}>
            {updating ? 'Updating…' : 'Update & Resume'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
