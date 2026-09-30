const UNCAPPED_BRIDGE_URL = 'http://127.0.0.1:23851'

const statusDot = document.getElementById('status-dot')
const statusText = document.getElementById('status-text')
const statusSubtext = document.getElementById('status-subtext')
const interceptToggle = document.getElementById('intercept-toggle')
const sizeFilter = document.getElementById('size-filter')
const refreshBtn = document.getElementById('refresh-btn')

function setOnlineUi() {
  statusDot.className = 'status-dot online'
  statusText.textContent = 'Connected'
  statusSubtext.textContent = 'Ready to bond multi-network downloads'
}

function setOfflineUi() {
  statusDot.className = 'status-dot offline'
  statusText.textContent = 'UnCapped Offline'
  statusSubtext.textContent = 'Open the UnCapped desktop app to enable bonding'
}

async function checkUnCappedStatus() {
  statusDot.className = 'status-dot'
  statusText.textContent = 'Checking UnCapped...'
  statusSubtext.textContent = ''

  // First attempt: Ask background service worker (immune to popup CORS/PNA restrictions)
  try {
    const bgResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CHECK_HEALTH' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve(null)
        } else {
          resolve(response)
        }
      })
    })

    if (bgResponse && bgResponse.online) {
      setOnlineUi()
      return
    }
  } catch {
    // fallback to direct fetch
  }

  // Second attempt: Direct fetch to loopback
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(`${UNCAPPED_BRIDGE_URL}/health`, { signal: controller.signal })
    clearTimeout(timer)

    if (res.ok) {
      const data = await res.json()
      if (data.status === 'ok') {
        setOnlineUi()
        return
      }
    }
  } catch {
    // offline
  }

  setOfflineUi()
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['uncappedConfig', 'plexoConfig'])
  const config = result.uncappedConfig || result.plexoConfig || { enabled: true, minSizeMB: 0 }
  interceptToggle.checked = config.enabled !== false
  sizeFilter.value = String(config.minSizeMB || 0)
}

async function saveSettings() {
  const config = {
    enabled: interceptToggle.checked,
    minSizeMB: parseInt(sizeFilter.value, 10) || 0
  }
  await chrome.storage.local.set({ uncappedConfig: config, plexoConfig: config })
}

interceptToggle.addEventListener('change', saveSettings)
sizeFilter.addEventListener('change', saveSettings)
refreshBtn.addEventListener('click', checkUnCappedStatus)

// Initialize
loadSettings()
checkUnCappedStatus()
