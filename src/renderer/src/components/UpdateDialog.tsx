import { useRef } from 'react'
import { DownloadIcon } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog'
import { buttonVariants } from './ui/button'

export function UpdateDialog(): React.JSX.Element | null {
  const availableUpdate = useAppStore((store) => store.availableUpdate)
  const dismissUpdate = useAppStore((store) => store.dismissUpdate)
  const downloadRef = useRef<HTMLAnchorElement>(null)

  if (!availableUpdate || availableUpdate.dismissed) return null

  return (
    <AlertDialog
      open={!availableUpdate.dismissed}
      onOpenChange={(open) => {
        if (!open) dismissUpdate()
      }}
    >
      <AlertDialogContent initialFocus={downloadRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>UnCapped {availableUpdate.version} is available</AlertDialogTitle>
          <AlertDialogDescription>A new version is ready to download.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={dismissUpdate}>Not now</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ size: 'sm' })}
            render={
              <a ref={downloadRef} href={availableUpdate.url} target="_blank" rel="noreferrer" />
            }
          >
            <DownloadIcon /> Download
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
