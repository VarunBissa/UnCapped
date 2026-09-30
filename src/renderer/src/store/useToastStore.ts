import { create } from 'zustand'

export type ToastType = 'success' | 'info' | 'warning' | 'error' | 'network'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
  action?: ToastAction
  duration?: number
  timestamp: number
  networkKind?: string
}

interface ToastStore {
  toasts: ToastItem[]
  addToast: (item: Omit<ToastItem, 'id' | 'timestamp'>) => string
  dismissToast: (id: string) => void
  clearAll: () => void
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  addToast: (item) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const duration = item.duration ?? 3500
    const newToast: ToastItem = {
      ...item,
      id,
      duration,
      timestamp: Date.now()
    }

    // Keep at most 4 simultaneous toasts to avoid crowding the screen
    set((state) => ({
      toasts: [...state.toasts.slice(-3), newToast]
    }))

    if (duration > 0) {
      setTimeout(() => {
        get().dismissToast(id)
      }, duration)
    }

    return id
  },
  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }))
  },
  clearAll: () => set({ toasts: [] })
}))

export const toast = {
  success: (title: string, message?: string, action?: ToastAction, duration?: number): string =>
    useToastStore.getState().addToast({ type: 'success', title, message, action, duration }),

  info: (title: string, message?: string, action?: ToastAction, duration?: number): string =>
    useToastStore.getState().addToast({ type: 'info', title, message, action, duration }),

  warning: (title: string, message?: string, action?: ToastAction, duration?: number): string =>
    useToastStore.getState().addToast({ type: 'warning', title, message, action, duration }),

  error: (title: string, message?: string, action?: ToastAction, duration?: number): string =>
    useToastStore.getState().addToast({ type: 'error', title, message, action, duration }),

  network: (title: string, message?: string, networkKind?: string, duration?: number): string =>
    useToastStore.getState().addToast({ type: 'network', title, message, networkKind, duration }),

  dismiss: (id: string): void => useToastStore.getState().dismissToast(id)
}
