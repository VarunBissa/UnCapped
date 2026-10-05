// Early theme initialization executed before React mount to prevent any theme flash.
try {
  const saved = localStorage.getItem('uncapped_theme')
  const root = document.documentElement
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    root.classList.add('dark')
    root.classList.remove('light')
    root.setAttribute('data-theme', 'dark')
  } else {
    root.classList.add('light')
    root.classList.remove('dark')
    root.setAttribute('data-theme', 'light')
  }
} catch {
  // localStorage might be blocked or unavailable
}
