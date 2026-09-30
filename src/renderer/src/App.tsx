import type { DownloadState } from '@shared/types'
import { useEffect } from 'react'
import { DevToolsPanel } from './components/DevToolsPanel'
import { TitleBar, type TitleBarNavButton, type TitleBarStatus } from './components/TitleBar'
import { NetworkBindingDialog } from './components/NetworkBindingDialog'
import { TooltipProvider } from './components/ui/tooltip'
import { useDownloadEvents } from './hooks/useDownloadEvents'
import { useNetworkPolling } from './hooks/useNetworkPolling'
import { CompleteScreen } from './screens/CompleteScreen'
import { DownloadingScreen } from './screens/DownloadingScreen'
import { ErrorScreen } from './screens/ErrorScreen'
import { FilesListScreen } from './screens/FilesListScreen'
import { IdleScreen } from './screens/IdleScreen'
import { NoConnectionsScreen } from './screens/NoConnectionsScreen'
import { ShutdownCountdownDialog } from './components/ShutdownCountdownDialog'
import { ToastContainer } from './components/ToastContainer'
import { UpdateDialog } from './components/UpdateDialog'
import { useAppStore } from './store/useAppStore'

function assertNever(status: never): never {
  throw new Error(`Unhandled download status: ${String(status)}`)
}

/** One screen + title-bar status per download.status — a switch with an assertNever default so
 * a new DownloadStatus value is a compile error here instead of silently falling into whichever
 * branch happened to be last. */
function renderDownload(
  download: DownloadState,
  handlers: { onNewDownload: () => void; onDownloadAgain: () => void; onBack?: () => void }
): { screen: React.JSX.Element; titleBarStatus: TitleBarStatus } {
  switch (download.status) {
    case 'downloading':
      return {
        screen: <DownloadingScreen download={download} onBack={handlers.onBack} />,
        titleBarStatus: {
          kind: 'combined',
          networkCount: new Set(download.chunks.map((chunk) => chunk.interfaceId)).size
        }
      }
    case 'paused':
      return {
        screen: <DownloadingScreen download={download} onBack={handlers.onBack} />,
        titleBarStatus: {
          kind: 'paused',
          networkCount: new Set(download.chunks.map((chunk) => chunk.interfaceId)).size
        }
      }
    case 'assembling':
      return {
        screen: <DownloadingScreen download={download} onBack={handlers.onBack} />,
        titleBarStatus: { kind: 'assembling' }
      }
    case 'completed':
      return {
        screen: <CompleteScreen download={download} onNewDownload={handlers.onNewDownload} />,
        titleBarStatus: { kind: 'none' }
      }
    case 'error':
    case 'cancelled':
      return {
        screen: (
          <ErrorScreen
            download={download}
            onNewDownload={handlers.onNewDownload}
            onDownloadAgain={handlers.onDownloadAgain}
          />
        ),
        titleBarStatus: { kind: 'none' }
      }
    default:
      return assertNever(download.status)
  }
}

function App(): React.JSX.Element {
  useDownloadEvents()
  useNetworkPolling(true)

  const interfaces = useAppStore((store) => store.interfaces)
  const interfacesStatus = useAppStore((store) => store.interfacesStatus)
  const currentDownload = useAppStore((store) => store.currentDownload)
  const clearCurrentDownload = useAppStore((store) => store.clearCurrentDownload)
  const loadNetworkPreferences = useAppStore((store) => store.loadNetworkPreferences)
  const loadThemeSource = useAppStore((store) => store.loadThemeSource)
  const loadInitialPaths = useAppStore((store) => store.loadInitialPaths)
  const activeView = useAppStore((store) => store.activeView)
  const setActiveView = useAppStore((store) => store.setActiveView)
  const selectedDownload = useAppStore((store) => store.selectedDownload)
  const fileList = useAppStore((store) => store.fileList)
  const selectDownloadForDetail = useAppStore((store) => store.selectDownloadForDetail)

  const checkForUpdate = useAppStore((store) => store.checkForUpdate)

  useEffect(() => {
    loadNetworkPreferences()
    loadThemeSource()
    loadInitialPaths()
    checkForUpdate()
  }, [loadNetworkPreferences, loadThemeSource, loadInitialPaths, checkForUpdate])

  const handleNewDownload = (): void => {
    if (currentDownload) void window.plexo.removeDownload(currentDownload.id)
    clearCurrentDownload()
  }

  const handleDownloadAgain = (): void => {
    if (currentDownload) {
      const url = currentDownload.url
      void window.plexo.removeDownload(currentDownload.id)
      clearCurrentDownload()
      useAppStore.getState().setDraftUrl(url)
    }
  }

  const noConnections = interfacesStatus === 'ready' && interfaces.length === 0

  let screen: React.JSX.Element
  let titleBarStatus: TitleBarStatus = { kind: 'none' }
  let navButton: TitleBarNavButton | undefined

  const onNavigateHome = (): void => setActiveView('idle')

  if (noConnections) {
    screen = <NoConnectionsScreen />
    titleBarStatus = { kind: 'offline' }
  } else if (activeView === 'list') {
    screen = (
      <FilesListScreen
        downloads={fileList}
        onSelectFile={(item) => selectDownloadForDetail(item)}
        onNewDownload={() => {
          clearCurrentDownload()
          setActiveView('idle')
        }}
      />
    )
    navButton = {
      label: 'Home',
      icon: 'arrow',
      onClick: onNavigateHome
    }
  } else if (activeView === 'idle' && !currentDownload && !selectedDownload) {
    screen = <IdleScreen />
    if (fileList.length > 0) {
      navButton = {
        label: 'Downloads',
        icon: 'download',
        onClick: () => setActiveView('list'),
        badge: fileList.length
      }
    }
  } else if (currentDownload || selectedDownload) {
    const detailDownload = (selectedDownload || currentDownload)!
    ;({ screen, titleBarStatus } = renderDownload(detailDownload, {
      onNewDownload: handleNewDownload,
      onDownloadAgain: handleDownloadAgain,
      onBack: () => setActiveView('list')
    }))
    if (fileList.length > 0) {
      navButton = {
        label: 'Downloads',
        icon: 'download',
        onClick: () => setActiveView('list'),
        badge: fileList.length
      }
    }
  } else {
    screen = <IdleScreen />
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <TitleBar status={titleBarStatus} navButton={navButton} onNavigateHome={onNavigateHome} />
        <div className="flex min-h-0 flex-1 flex-col">{screen}</div>
        <DevToolsPanel />
        <NetworkBindingDialog />
        <ShutdownCountdownDialog />
        <ToastContainer />
        <UpdateDialog />
      </div>
    </TooltipProvider>
  )
}

export default App
