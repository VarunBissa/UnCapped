import type { WhatsNewItem } from './types'

export const CHANGELOG_HISTORY: WhatsNewItem[] = [
  {
    version: '1.0.1',
    title: 'Dynamic UI Scaling, Custom Installer Path & In-App Auto-Updates',
    date: 'October 2026',
    features: [
      'Dynamic UI & Font Zooming: Scale the entire app up with Ctrl + "+" (or Ctrl + "="), down with Ctrl + "-", or reset with Ctrl + "0". Full numpad support included.',
      'Persistent Zoom Settings: Your selected zoom factor is remembered and automatically restored when launching UnCapped.',
      'Floating Zoom HUD: Glassmorphic indicator shows the current magnification percentage with auto-fade.',
      'Custom Windows Setup Directory: The installer wizard now lets you choose any drive or folder path (e.g. D:\\Apps) with a Browse dialog.',
      'In-App Auto-Updates: Download and install new UnCapped updates directly inside the app with a live progress bar and 1-click restart.'
    ],
    improvements: [
      'Supercharged File Reassembly: Sized streaming buffers to 4 MB with parallel chunk validation for fast completion.',
      'Sticky Home Network Connection: Prevents temporary link drops from prematurely dropping your fastest interface.',
      'Adaptive Stream Scaling: Automatically grows TCP streams to fully saturate multi-gigabit bonded networks.',
      'Enhanced Dev Experience: Added UV_THREADPOOL_SIZE expansion for high-concurrency network benchmarks.'
    ],
    fixes: [
      'Wi-Fi Range Extender Bufferbloat Protection: Automatic link quarantine and smooth recovery on congested repeaters.',
      'Responsive Title Bar: Adaptive layout prevents action buttons and status badges from clipping or wrapping at high zoom levels.'
    ]
  },
  {
    version: '1.0.0',
    title: 'Initial Release: Multi-Interface Network Bonding',
    date: 'September 2026',
    features: [
      'Bonded Multi-Interface Downloads: Combine Wi-Fi, Ethernet, and Mobile Hotspot simultaneously.',
      'Real-Time Speed Metrics: Live per-interface breakdown and throughput charts.',
      'Gaming / Latency Shield: Isolates low-latency links from bulk downloads to prevent ping spikes.'
    ],
    improvements: [
      'Native dark/light theme switching with sub-pixel typography.',
      'Zero-configuration link auto-detection.'
    ],
    fixes: ['Initial release stability and crash prevention.']
  }
]

export function getWhatsNewForVersion(version: string): WhatsNewItem | null {
  const normalized = version.replace(/^v/, '')
  const found = CHANGELOG_HISTORY.find((item) => item.version === normalized)
  if (found) return found
  // If not found (e.g. future version), return the latest changelog item
  return CHANGELOG_HISTORY[0] ?? null
}
