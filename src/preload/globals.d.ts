import type { PlexoApi, UnCappedApi } from './index'

declare global {
  interface Window {
    uncapped: UnCappedApi
    plexo: PlexoApi
  }
}
