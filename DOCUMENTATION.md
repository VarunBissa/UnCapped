# UnCapped — Complete Technical Project Documentation

> **Multi-Network Bandwidth Aggregation Download Manager for Windows, macOS, and Linux.**

---

## Table of Contents

1. [Executive Summary & Core Value Proposition](#1-executive-summary--core-value-proposition)
2. [System Architecture & Multi-Process Model](#2-system-architecture--multi-process-model)
3. [Network Discovery & Socket-Level Interface Binding](#3-network-discovery--socket-level-interface-binding)
4. [Download Engine & Scheduling Mechanics](#4-download-engine--scheduling-mechanics)
   - [4.1 Probe & Pre-flight Phase](#41-probe--pre-flight-phase)
   - [4.2 Work-Stealing Block Scheduler](#42-work-stealing-block-scheduler)
   - [4.3 Tail-Racing (Hedging) Algorithm](#43-tail-racing-hedging-algorithm)
   - [4.4 Chunk Writing & Streaming Reassembly](#44-chunk-writing--streaming-reassembly)
   - [4.5 Crash Recovery & State Resumption](#45-crash-recovery--state-resumption)
5. [WebTorrent & Peer-to-Peer Engine](#5-webtorrent--peer-to-peer-engine)
6. [Chrome Browser Extension & Loopback Bridge](#6-chrome-browser-extension--loopback-bridge)
7. [Frontend Architecture & User Interface](#7-frontend-architecture--user-interface)
   - [7.1 Screen State Machine](#71-screen-state-machine)
   - [7.2 Real-Time Bandwidth & Block Grid Visualizer](#72-real-time-bandwidth--block-grid-visualizer)
   - [7.3 Speed Test Benchmark Engine](#73-speed-test-benchmark-engine)
   - [7.4 Virtual Network Simulation DevTools](#74-virtual-network-simulation-devtools)
8. [IPC API & Typed Contract Reference](#8-ipc-api--typed-contract-reference)
9. [Repository Structure & Codebase Tour](#9-repository-structure--codebase-tour)
10. [Development, Testing & Build Workflows](#10-development-testing--build-workflows)
11. [Configuration Flags & Environment Knobs](#11-configuration-flags--environment-knobs)
12. [Networking Fundamentals & Troubleshooting Guide](#12-networking-fundamentals--troubleshooting-guide)
13. [Origins, Inspiration & Acknowledgments](#13-origins-inspiration--acknowledgments)
14. [License](#14-license)

---

## 1. Executive Summary & Core Value Proposition

### The Problem

Modern computers frequently connect to multiple active internet uplinks at the same time:

- Wi-Fi (fiber broadband) + Ethernet (local LAN / dedicated fiber)
- Wi-Fi + Mobile Tethering (USB RNDIS / 4G/5G Hotspot)
- Multiple Ethernet interfaces / Thunderbolt docks

Standard operating systems (Windows, macOS, Linux) resolve all outbound internet traffic using a single default gateway metric in their kernel routing tables. As a result, standard web browsers (Google Chrome, Firefox, Safari) and conventional download utilities (cURL, Wget, IDM) route 100% of their network packets through one primary network interface. Any secondary connections remain completely unused, wasting available bandwidth.

Existing multi-WAN solutions require either:

1. **Multipath TCP (MPTCP)**: Requires both the client OS and the remote origin web server to run custom MPTCP kernels (rarely supported by CDNs and web hosts).
2. **Channel Bonding Hardware / VPN Aggregators (e.g. Speedify)**: Incur recurring subscription costs, route all user traffic through third-party proxy relays, add latency, and frequently trigger CAPTCHAs.

### The UnCapped Solution

**UnCapped** aggregates bandwidth across all connected network adapters locally without requiring specialized router hardware, VPN intermediaries, kernel modifications, or remote server cooperation.

By binding outbound TCP sockets to the specific local IP address assigned to each physical adapter (`localAddress`), the operating system's network stack routes each socket's packets through its respective physical gateway. UnCapped breaks target files into byte slices using standard HTTP Range requests (`Range: bytes=X-Y`), pulls chunks across all connections concurrently via a dynamic work-stealing scheduler, and reassembles them sequentially into a single bit-perfect destination file.

> **Origins & Attribution**: UnCapped is inspired by and built upon the open-source **Plexo** project created by **Anmol Kapil** ([github.com/anmolkapil/plexo](https://github.com/anmolkapil/plexo)). Full credit and architectural acknowledgments are detailed in [Section 13: Origins, Inspiration & Acknowledgments](#13-origins-inspiration--acknowledgments).

---

## 2. System Architecture & Multi-Process Model

UnCapped is engineered following Electron's secure multi-process architecture with strict process isolation.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Chrome Browser Extension                         │
│   • Background Service Worker (chrome.downloads interceptor)             │
│   • Popup UI (interception toggle, threshold settings)                   │
│   • Context Menus ("Download with UnCapped")                             │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ HTTP POST (http://127.0.0.1:23851)
                                     │ Token: X-UnCapped-Token
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          Electron Main Process                           │
│                                                                          │
│  ┌────────────────────────┐              ┌────────────────────────────┐  │
│  │    Extension Bridge    │              │     Network Subsystem      │  │
│  │ (HTTP Server on 23851) │              │  • Physical Adapter Enum   │  │
│  └───────────┬────────────┘              │  • Latency & Jitter Ping   │  │
│              │                           │  • Socket-to-IP Binding    │  │
│              ▼                           │  • Speed Limits & Quotas   │  │
│  ┌───────────────────────────────────────┴─────────────────────────┐  │  │
│  │                       Download Manager Engine                   │  │  │
│  │  • URL Probing (HTTP 206, ETag, Last-Modified, RFC 6266 names)   │  │  │
│  │  • Work-Stealing Block Scheduler & Tail-Racing (Hedging)        │  │  │
│  │  • Multi-stream HTTP/HTTPS Range Chunk Downloader               │  │  │
│  │  • Part-file Writer & Sequential Append-mode Stream Assembler   │  │  │
│  │  • Crash Recovery Manifest Journaling (`manifest.json`)         │  │  │
│  │  • WebTorrent BitTorrent / Magnet Subsystem                     │  │  │
│  └───────────────────────────────────┬─────────────────────────────┘  │  │
│                                      │                                   │
└──────────────────────────────────────┼───────────────────────────────────┘
                                       │ IPC (`contextBridge` / `preload.ts`)
                                       │ Strongly Typed Channel Contracts
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         Renderer Process (UI)                            │
│  • React 19 + TypeScript + Vite 7                                        │
│  • Tailwind CSS v4 + Curated Network Swatch Palette                      │
│  • Global State: Zustand (`useAppStore.ts`)                              │
│  • Screens: Idle, Downloading, Complete, FilesList, Error, NoConnections │
│  • Live Visualizations: Aggregate Speedometer, Block Grid, Interface Bars│
│  • Interactive Speed Test Benchmark Suite                                │
│  • Virtual Simulation DevTools Panel (fault injection & bandwidth caps)  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Process Responsibilities

1. **Main Process (`src/main/`)**:
   - Manages OS native window lifecycle, system tray, and native menus.
   - Discovers physical network hardware across Windows, macOS, and Linux.
   - Executes multi-socket network requests, per-interface rate limiters, and byte quotas.
   - Manages disk I/O, writing chunk parts, streaming assembly, and crash manifests.
   - Runs the local HTTP loopback server (port 23851) to interface with the browser extension.

2. **Preload Script (`src/preload/`)**:
   - Runs in an isolated execution context before web content loads.
   - Uses `contextBridge.exposeInMainWorld` to expose a typed, sanitized API on `window.uncapped`.
   - Never exposes raw Node.js or Electron internals (`fs`, `child_process`, `ipcRenderer`) to the renderer.

3. **Renderer Process (`src/renderer/`)**:
   - Single Page Application (SPA) built with React 19 and Tailwind CSS v4.
   - Consumes `window.uncapped` exclusively via typed IPC calls.
   - Houses the screen state machine and high-framerate rendering loops for live throughput visualization.

---

## 3. Network Discovery & Socket-Level Interface Binding

The networking core (`src/main/network/`) is responsible for identifying valid physical network adapters and routing TCP traffic through them.

### 3.1 Physical Adapter Enumeration (`interfaces.ts`)

Standard Node.js `os.networkInterfaces()` lists all adapters including virtual loopbacks, VPN tunnels, Hyper-V/WSL bridges, and Docker interfaces. UnCapped filters these out to ensure traffic only flows across real, physically distinct uplinks.

- **Windows**:
  Executes an optimized PowerShell script querying CIM/WMI:

  ```powershell
  Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Select-Object Name, InterfaceDescription, MacAddress
  ```

  Correlates the output with `Get-NetIPAddress -AddressFamily IPv4` to map each physical interface to its local IPv4 address, default gateway, and user-friendly name (e.g., `"Wi-Fi"`, `"Ethernet 2"`).

- **macOS**:
  Parses hardware configurations via:

  ```bash
  networksetup -listallhardwareports
  ```

  Matches BSD interface identifiers (`en0`, `en1`) against active IPv4 assignments obtained from `os.networkInterfaces()`.

- **Linux**:
  Inspects `/sys/class/net/` and parses `/proc/net/route` and `ip -o link` to distinguish physical hardware (`/sys/class/net/<dev>/device`) from virtual devices (bridges, veth pairs).

### 3.2 Socket-Level Binding (`chunkDownloader.ts`, `deviceBinding.ts`)

To force outbound packets onto a specific network adapter without modifying the OS kernel routing table, UnCapped configures the underlying Node.js TCP socket:

- **Source IP Binding (Cross-Platform)**:
  Node's `http.Agent` and `https.Agent` accept a `localAddress` option. When `localAddress: <adapter_ip>` is provided:

  ```typescript
  const agent = new https.Agent({
    localAddress: interfaceInfo.address,
    keepAlive: true,
    maxSockets: 8
  })
  ```

  The OS network stack binds the local endpoint of the TCP socket to that specific network adapter's IP address. Outbound packets carry that source IP and are automatically directed out through that interface's physical gateway.

- **SO_BINDTODEVICE (Linux Fallback)**:
  On Linux systems where multiple interfaces belong to the same subnet or have overlapping routing metrics, source IP binding alone can be ambiguous. UnCapped uses `koffi` (C FFI) to invoke `setsockopt(fd, SOL_SOCKET, SO_BINDTODEVICE, interfaceName)` directly on the underlying socket file descriptor for guaranteed hardware routing.

### 3.3 Latency & Jitter Probing (`latency.ts`)

UnCapped maintains a continuous background health monitor for every active interface:

- Dispatches lightweight TCP SYN handshakes to public anycast DNS endpoints (`1.1.1.1:53`, `8.8.8.8:53`).
- Binds each probe socket to the interface under test.
- Measures round-trip time (RTT) to compute moving-average latency and jitter, alerting the user to degraded connections.

### 3.4 Per-Interface Controls & Quotas (`preferences.ts`)

Users can configure granular policies per network interface:

- **Custom Naming & Color Swatches**: Assign custom display labels and distinct UI colors.
- **Metered Connection Mode**: Mark cellular connections as metered.
- **Speed Limits**: Token-bucket rate limiters throttle individual adapters (e.g., limit tethering to 2 MB/s).
- **Data Caps**: Set hard byte budgets (e.g., stop using mobile hotspot after 500 MB).

---

## 4. Download Engine & Scheduling Mechanics

The download engine (`src/main/download/`) partitions files, balances load across connections, guarantees data integrity, and handles network disruptions.

```
                      [ Download Request ]
                                │
                                ▼
                       [ 1. Probe URL ]
                (Range Check, Size, Validators)
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       Supports HTTP Ranges?          Single-Stream Only
                 │                             │
                 ▼                             ▼
     [ 2. Partition into Blocks ]     [ Single Socket Stream ]
          (e.g., 8 MB blocks)                  │
                 │                             │
                 ▼                             │
    [ 3. Work-Stealing Scheduler ]             │
    ┌────────────┬────────────┐                │
    ▼            ▼            ▼                │
 Worker 1     Worker 2     Worker 3            │
 (Wi-Fi)     (Ethernet)   (Cellular)           │
    │            │            │                │
    ▼            ▼            ▼                │
 .part-0      .part-1      .part-2             │
    └────────────┬────────────┘                │
                 ▼                             │
       All Blocks Finished?                    │
                 │                             │
                 ▼                             ▼
    [ 4. Streaming Assembler ] ◄───────────────┘
      (Sequential Append to Destination)
                 │
                 ▼
     [ 5. Integrity Verification ]
                 │
                 ▼
       [ Download Complete ]
```

### 4.1 Probe & Pre-flight Phase (`probe.ts`)

Before starting a download, UnCapped performs an initial pre-flight check using a 1-byte range request:

```http
GET /archive.iso HTTP/1.1
Host: mirrors.example.com
Range: bytes=0-0
User-Agent: UnCapped/1.0
```

The probe verifies:

1. **HTTP 206 Partial Content**: Confirms the origin server supports byte-range slicing. If the server responds with `200 OK`, byte ranges are not supported, and UnCapped automatically falls back to single-connection streaming.
2. **Total File Size**: Parsed from the `Content-Range: bytes 0-0/104857600` header.
3. **HTTP Cache Validators**: Captures `ETag` and `Last-Modified` tokens. These validators are stored in the download manifest and used during pause/resume to guarantee the remote file hasn't changed.
4. **Filename Extraction**: Sanitizes filenames using RFC 6266 `Content-Disposition` directives, falling back to the URL path or an autogenerated fallback.
5. **Torrent Sniffing**: Inspects headers and magic bytes for `.torrent` metadata or `magnet:?` protocols, forwarding them to the WebTorrent engine when detected.

### 4.2 Work-Stealing Block Scheduler (`scheduler.ts`)

Traditional multi-part download managers divide a file into equal slices upfront (e.g., 4 adapters = 4 equal chunks). If one connection drops or slows down, the entire download stalls waiting for that single slow connection.

UnCapped uses a **dynamic work-stealing block scheduler**:

- Files are partitioned into smaller blocks (default: 8 MB). A 1 GB file yields 128 blocks.
- Blocks are maintained in a thread-safe pending queue.
- Each physical network adapter is allocated a pool of worker streams (configured via `connectionsPerNetwork`).
- As soon as a worker stream completes its current block, it immediately leases the next available block from the global queue.
- Faster connections naturally process more blocks, automatically balancing load without complex manual tuning.

### 4.3 Tail-Racing (Hedging) Algorithm

At the end of a download, the pending queue empties and only a few straggler blocks remain assigned to slow or degraded connections.

To eliminate this bottleneck, UnCapped implements **tail-racing (hedging)**:

1. When all unassigned blocks have been leased and an idle worker connection is available on a faster network, the scheduler flags lagging blocks.
2. The idle worker spawns a duplicate "hedge" request for the same byte range on its own interface.
3. Both streams race to download the block.
4. Whichever stream finishes first writes the block to disk. The losing stream is aborted, and its temporary slice is discarded.

### 4.4 Chunk Writing & Streaming Reassembly (`partFiles.ts`)

- **Isolated Part Files**: To prevent lock contention and avoid sparse-file pre-allocation issues on NTFS/APFS/ext4 filesystems, each chunk writes to an isolated temporary file (`<destination>.part-<index>`).
- **Sequential Append-Mode Assembler**:
  Once all chunks are downloaded, a streaming reassembly pipeline opens the target file in append mode (`{ flags: 'a' }`):
  ```typescript
  for (let i = 0; i < totalChunks; i++) {
    const partPath = `${destPath}.part-${i}`
    await pipeStreamToFile(partPath, destFileStream)
    await fs.promises.unlink(partPath)
  }
  ```
  This guarantees minimal memory overhead even when assembling files tens of gigabytes in size.
- **Integrity Validation**: The final file size is checked against `totalBytes`. If any mismatch occurs, the download enters an error state to protect against truncated files.

### 4.5 Crash Recovery & State Resumption (`downloadManager.ts`)

- **Manifest Journaling**: The engine writes state changes to a companion manifest file (`<destination>.manifest.json`). The manifest tracks:
  - Download metadata (URL, file size, validators, block layout).
  - Completed blocks and partial byte offsets of active chunks.
  - Per-interface byte attribution totals.
- **Crash Resumption**: If the application crashes or power is lost, UnCapped loads the manifest on startup, displays the download in a `paused` state, and verifies that on-disk part files match the recorded byte lengths.
- **Cache Re-validation**: Resuming a download triggers a conditional HTTP request (`If-Match: etag` or `If-Unmodified-Since`). If the remote server returns `412 Precondition Failed`, UnCapped alerts the user that the remote file has changed rather than corrupting the local file.

---

## 5. WebTorrent & Peer-to-Peer Engine

In addition to HTTP/HTTPS downloads, UnCapped includes native support for BitTorrent swarms (`webtorrentLoader.ts`):

- Handles `magnet:?xt=urn:btih:...` links and local `.torrent` files.
- Dynamically imports `webtorrent` in the main process.
- Binds P2P peer listening ports across available interfaces.
- Exposes torrent metadata, swarm peer counts, piece progress, and download speeds through the standard UnCapped UI.

---

## 6. Chrome Browser Extension & Loopback Bridge

UnCapped includes a companion Google Chrome Manifest V3 extension (`extension/`) that intercepts browser downloads and hands them over to the desktop app.

### 6.1 Extension Architecture

- **`manifest.json`**: Configures permissions (`downloads`, `contextMenus`, `storage`) and registers background service workers.
- **`background.js`**:
  - Hooks into `chrome.downloads.onCreated`.
  - Captures download URLs, cookies, HTTP referrers, and post-data.
  - Cancels Chrome's native single-connection download.
  - Forwards the request to the desktop app over HTTP loopback.
  - Implements **zero-interruption failover**: if the UnCapped desktop app is not running, the extension ignores the event, allowing Chrome to handle the download normally.
- **`popup.html` & `popup.js`**:
  - Provides a toggle to enable/disable automatic interception.
  - Configures minimum file size thresholds (e.g., only intercept files larger than 100 MB).
- **Context Menu**:
  - Adds a right-click "Download with UnCapped (Multi-Network)" action for links, images, audio, and video elements.

### 6.2 Loopback Bridge Protocol (`src/main/bridge/extensionBridge.ts`)

The main process runs an HTTP server bound strictly to the local loopback address `127.0.0.1:23851`.

- **Endpoints**:
  - `GET /health`: Returns `{ status: 'ok', app: 'UnCapped', version: '...' }`.
  - `POST /download`: Accepts JSON payloads containing `{ url, cookies, referrer, suggestedFileName }`.
- **Security Controls**:
### 6.3 Extension Installation & Setup

1. **Download Release Package**: Download `uncapped-chrome-extension.zip` from [Releases](https://github.com/VarunBissa/UnCapped/releases) and extract it.
2. **Load into Browser**:
   - Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
   - Turn **ON** **Developer mode** in the top right.
   - Click **Load unpacked** and select the extracted `extension` directory.
3. **Usage**:
   - Ensure the UnCapped desktop app is running.
   - Click the UnCapped extension icon in the browser toolbar to confirm connection.
   - Any initiated download (or right-click context menu "Download with UnCapped") will automatically hand off to the UnCapped multi-interface acceleration engine.

---

## 7. Frontend Architecture & User Interface

The renderer process is a React 19 application optimized for real-time performance.

### 7.1 Screen State Machine

The UI transitions through six primary screens managed via the Zustand store (`src/renderer/src/store/useAppStore.ts`):

```
       ┌────────────────────────┐
       │   NoConnectionsScreen  │ ◄─── (Zero active physical adapters detected)
       └───────────┬────────────┘
                   │
                   ▼ (1+ connections active)
       ┌────────────────────────┐
       │       IdleScreen       │ ◄─── (Waiting for URL / drag-and-drop / extension)
       └───────────┬────────────┘
                   │
                   ▼ (Start Download)
       ┌────────────────────────┐
       │   DownloadingScreen    │ ◄─── (Active chunk transfer, work-stealing)
       └───────────┬────────────┘
                   │
                   ▼ (All chunks finished)
       ┌────────────────────────┐
       │   DownloadingScreen    │ ◄─── (Status: 'assembling' — stream reassembly)
       └───────────┬────────────┘
                   │
                   ▼ (Assembly complete)
       ┌────────────────────────┐
       │     CompleteScreen     │ ◄─── (Open file, reveal in folder, metrics summary)
       └────────────────────────┘
```

Additional dedicated views include:

- **`FilesListScreen.tsx`**: Download history manager (search, filter, clear, resume paused tasks).
- **`ErrorScreen.tsx`**: Network error diagnostics, HTTP error details, and retry actions.

### 7.2 Real-Time Bandwidth & Block Grid Visualizer

- **Aggregate Speed Gauge**: Displays current combined throughput, peak speed, ETA, and elapsed time.
- **Per-Interface Visualizer**: Dynamic progress bars colored with curated interface swatches show the live speed and total data delivered by each physical connection.
- **Interactive Block Grid**:
  - Displays every 8 MB block as an interactive square.
  - Blocks dynamically color-code based on the interface that downloaded them.
  - Hovering over a block displays its byte range, throughput, and connection assignment.

### 7.3 Speed Test Benchmark Engine (`SpeedTestButton.tsx`)

- Integrated multi-connection bandwidth benchmark.
- Downloads ephemeral test files from distributed Cloudflare/Fastly CDN edge nodes.
- Measures combined aggregate speed vs. individual interface speeds without writing test data to disk.

### 7.4 Virtual Network Simulation DevTools (`simDownload.ts`)

- Developer panel allowing realistic UI and network testing without relying on physical hardware.
- Simulates custom network topologies (e.g., "50 Mbps Fiber" + "15 Mbps 4G Hotspot").
- Injects configurable packet drop and connection failure rates (0–100%) to verify error recovery, chunk retries, and the hedging algorithm.

---

## 8. IPC API & Typed Contract Reference

Communication between the Renderer and Main process is strongly typed via `src/shared/ipc-contract.ts` and `src/shared/ipc-channels.ts`.

| Channel                            | Direction       | Payload                         | Return Type              | Description                                           |
| :--------------------------------- | :-------------- | :------------------------------ | :----------------------- | :---------------------------------------------------- |
| `network:list-interfaces`          | Renderer ➔ Main | `void`                          | `NetworkInterfaceInfo[]` | Enumerates active physical network adapters.          |
| `network:ping-interfaces`          | Renderer ➔ Main | `void`                          | `Record<string, number>` | Measures latency (RTT in ms) to public DNS endpoints. |
| `network:get-preferences`          | Renderer ➔ Main | `void`                          | `NetworkPreferences`     | Retrieves user names, colors, and rate limits.        |
| `network:set-preference`           | Renderer ➔ Main | `{ id, preference }`            | `void`                   | Updates settings for a specific interface.            |
| `download:probe`                   | Renderer ➔ Main | `{ url }`                       | `ProbeResult`            | Pre-flights a URL for range support and metadata.     |
| `download:start`                   | Renderer ➔ Main | `StartDownloadRequest`          | `void`                   | Initiates a multi-network download.                   |
| `download:start-simulated`         | Renderer ➔ Main | `StartSimulatedDownloadRequest` | `void`                   | Starts a simulated virtual download.                  |
| `download:get-current`             | Renderer ➔ Main | `void`                          | `DownloadState \| null`  | Returns state of the active download.                 |
| `download:pause`                   | Renderer ➔ Main | `void`                          | `void`                   | Pauses active chunk streams.                          |
| `download:resume`                  | Renderer ➔ Main | `void`                          | `void`                   | Resumes a paused download with cache validation.      |
| `download:cancel`                  | Renderer ➔ Main | `void`                          | `void`                   | Cancels download and purges temporary part files.     |
| `download:updated`                 | Main ➔ Renderer | `DownloadState`                 | Event Broadcast          | Pushes real-time progress and speed updates.          |
| `dialog:choose-destination-folder` | Renderer ➔ Main | `void`                          | `string \| null`         | Displays native folder picker dialog.                 |
| `shell:reveal-in-folder`           | Renderer ➔ Main | `string` (file path)            | `void`                   | Highlights completed file in Explorer/Finder.         |
| `clipboard:read-text`              | Renderer ➔ Main | `void`                          | `string`                 | Reads clipboard contents for URL pasting.             |
| `theme:get-source`                 | Renderer ➔ Main | `void`                          | `'light' \| 'dark'`      | Retrieves current theme preference.                   |
| `theme:set-source`                 | Renderer ➔ Main | `'light' \| 'dark'`             | `void`                   | Updates application theme.                            |

---

## 9. Repository Structure & Codebase Tour

```text
uncapped/
├── build/                        # Packaging assets & icons
│   ├── icon.ico                  # Windows multi-size icon (16, 32, 48, 64, 128, 256px)
│   ├── icon.png                  # High-resolution 512x512 app icon
│   └── entitlements.mac.plist    # macOS hardened runtime entitlements
├── docs/                         # Documentation site & release download portal
│   ├── index.html                # Responsive web landing page
│   └── downloads.js              # Platform detection and release asset router
├── e2e/                          # Playwright End-to-End integration test suite
│   ├── download.spec.ts          # Range download, probe, and assembly tests
│   ├── chaos.spec.ts             # Connection drop and network failure tests
│   ├── recovery.spec.ts          # Crash recovery and pause/resume validation
│   └── fixtures.ts               # Test harnesses and local HTTP mock servers
├── extension/                    # Google Chrome Manifest V3 companion extension
│   ├── manifest.json             # Extension permissions and background worker config
│   ├── background.js             # Download interception and loopback bridge client
│   ├── popup.html / popup.js     # Interception preferences and threshold settings
│   └── icons/                    # Browser action icons (16, 32, 48, 128px)
├── resources/                    # Runtime application assets
│   ├── icon-dark.png             # Frameless titlebar window icon
│   └── logo.png                  # High-resolution master brand logo
├── src/
│   ├── main/                     # Electron Main Process (Node.js runtime)
│   │   ├── bridge/               # Extension loopback HTTP bridge (port 23851)
│   │   ├── download/             # Core download engine
│   │   │   ├── blockProgress.ts  # Per-block byte progress tracking
│   │   │   ├── chunkDownloader.ts# HTTP socket worker with localAddress binding
│   │   │   ├── downloadManager.ts# Master engine orchestrator & manifest persistence
│   │   │   ├── fileVersion.ts    # ETag and Last-Modified validator checks
│   │   │   ├── partFiles.ts      # Temporary part file writer & stream combiner
│   │   │   ├── paths.ts          # File path resolution & duplicate renaming
│   │   │   ├── probe.ts          # HTTP 206 range capability pre-flight probe
│   │   │   ├── scheduler.ts      # Dynamic work-stealing block scheduler
│   │   │   ├── simDownload.ts    # Simulated download generator for development
│   │   │   └── webtorrentLoader.ts# BitTorrent & Magnet protocol integration
│   │   ├── network/              # Physical adapter discovery & socket binding
│   │   │   ├── deviceBinding.ts  # SO_BINDTODEVICE Linux FFI bindings
│   │   │   ├── interfaces.ts     # Multi-platform hardware adapter detection
│   │   │   ├── latency.ts        # Interface latency & jitter measurement
│   │   │   └── preferences.ts    # Per-interface settings, quotas, and throttling
│   │   ├── ipc/                  # IPC handlers and message registration
│   │   ├── index.ts              # Electron application entry point
│   │   ├── settings.ts           # User configuration storage (theme, bounds)
│   │   └── testKnobs.ts          # Runtime test hooks and environment flags
│   ├── preload/                  # Electron Preload Script
│   │   ├── index.ts              # contextBridge implementation exposing window.uncapped
│   │   └── globals.d.ts          # Window interface TypeScript declarations
│   ├── renderer/                 # React 19 Frontend
│   │   ├── src/
│   │   │   ├── assets/           # CSS styles, theme tokens, and static assets
│   │   │   ├── components/       # UI components (TitleBar, SpeedTest, Dialogs)
│   │   │   ├── screens/          # Application views (Idle, Downloading, Complete, etc.)
│   │   │   ├── store/            # Zustand global state store (useAppStore.ts)
│   │   │   └── utils/            # Byte, throughput, and duration formatters
│   │   └── index.html            # Webpack/Vite HTML template
│   └── shared/                   # Shared type definitions & constants
│       ├── ipc-channels.ts       # IPC channel name string constants
│       ├── ipc-contract.ts       # Strongly typed IPC request/response contract
│       └── types.ts              # Core shared TypeScript interfaces
├── electron-builder.yml          # Multi-platform packaging configuration
└── package.json                  # Project dependencies and build scripts
```

---

## 10. Development, Testing & Build Workflows

### 10.1 Prerequisites

- **Node.js**: v20.0.0 or higher
- **npm**: v10.0.0 or higher
- **OS**: Windows 10/11, macOS 12+, or modern Linux distribution (Ubuntu 22.04+)
- **Build Tools**:
  - Windows: Visual Studio C++ Build Tools (for native module compilation)
  - Linux: `build-essential`, `libudev-dev`

### 10.2 Installation & Development

```bash
# Clone the repository
git clone https://github.com/VarunBissa/UnCapped.git
cd UnCapped

# Install project dependencies
npm install

# Start Electron app in development mode with Hot Module Replacement
npm run dev
```

### 10.3 Static Analysis & Code Quality

```bash
# Run TypeScript compilation checks across all project targets
npm run typecheck

# Check formatting compliance
npm run format:check

# Auto-format codebase using Prettier
npm run format

# Run ESLint validation
npm run lint
```

### 10.4 End-to-End Testing (Playwright)

UnCapped features an automated Playwright test suite that spins up headless Electron instances alongside local HTTP range test servers:

```bash
# Run smoke tests
npm run test:e2e:smoke

# Run full integration test suite (Range checks, chaos drops, pause/resume)
npm run test:e2e
```

### 10.5 Building Distributables

Packaging is managed by `electron-builder`:

```bash
# Package for Windows (Generates NSIS installer in dist/)
npm run build:win

# Package for macOS (Generates DMG & ZIP in dist/)
npm run build:mac

# Package for Linux (Generates AppImage and DEB in dist/)
npm run build:linux

# Quick unpacked build (Generates loose binaries without installer overhead)
npm run build:unpack
```

---

## 11. Configuration Flags & Environment Knobs

UnCapped provides environment variables to assist with debugging, testing, and automated benchmarking:

| Environment Variable             | Description                                                                                                 |
| :------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| `UNCAPPED_DEBUG` / `PLEXO_DEBUG` | Set to `1` to enable verbose console logging for socket states, chunk completions, and scheduler decisions. |
| `UNCAPPED_USER_DATA`             | Overrides the application data path. Used in tests to run in isolated, disposable directories.              |
| `UNCAPPED_E2E_BLOCK_BYTES`       | Overrides the default 8 MB block size (e.g. set to `65536` to test hundreds of chunks on small test files). |
| `UNCAPPED_E2E_INTERFACES`        | Injects synthetic network adapters, enabling multi-network testing on single-connection machines.           |
| `UNCAPPED_E2E_STALL_MS`          | Adjusts the socket watchdog timeout for detecting stalled connections.                                      |
| `UNCAPPED_E2E_HEDGE_MS`          | Configures the idle-time threshold before tail-racing hedges are spawned for lagging blocks.                |

---

## 12. Networking Fundamentals & Troubleshooting Guide

### 12.1 Same-Subnet Interface Conflicts

- **Issue**: When connecting to both Wi-Fi and Ethernet from the same router, the router may assign IP addresses in the same subnet (e.g., `192.168.1.5` and `192.168.1.6`).
- **Result**: While sockets bind to distinct IP addresses, both connections share the same physical internet gateway and WAN bandwidth. Total download speed will not exceed the single ISP uplink limit.
- **Solution**: To achieve true bandwidth aggregation, connect to distinct uplinks (e.g., Home Fiber Wi-Fi + 5G Mobile Phone USB Tethering).

### 12.2 Single-Stream Fallback Mode

- **Issue**: UnCapped downloads a file using only one connection despite multiple adapters being active.
- **Cause**: The origin web server responded to the pre-flight check with HTTP `200 OK` instead of HTTP `206 Partial Content` (byte ranges disabled), or omitted the `Content-Length` header.
- **Resolution**: UnCapped automatically falls back to single-connection streaming to ensure the file downloads successfully rather than failing.

### 12.3 Antivirus & Firewall SSL Interception

- **Issue**: Sockets fail to bind or terminate with `ECONNRESET`.
- **Cause**: Third-party antivirus programs with HTTPS scanning features may intercept local loopback traffic or block non-default outbound routing.
- **Resolution**: Add an exclusion for the `UnCapped` binary or disable HTTPS socket inspection for local applications.

---

## 13. Origins, Inspiration & Acknowledgments

This project is built upon the foundational work and groundbreaking multi-network architecture created and open-sourced by **Anmol Kapil** in the original **Plexo** repository:

- **Original GitHub Repository**: [https://github.com/anmolkapil/plexo](https://github.com/anmolkapil/plexo)
- **Original Author**: [Anmol Kapil (@anmolkapil)](https://github.com/anmolkapil)

### Key Architectural Contributions & Credit

Full credit and sincere gratitude are extended to Anmol Kapil for designing, architecting, and developing the foundational innovations that power this project:

- **Socket-Level IP Binding Concept**: Innovating the use of Node.js `http.Agent({ localAddress })` and Linux `SO_BINDTODEVICE` FFI to overcome the OS single-default-gateway limitation without requiring specialized hardware or VPN intermediaries.
- **Dynamic Work-Stealing Range Scheduler**: Designing the block leasing engine and the anti-straggler tail-racing (hedging) algorithm that balances workload across heterogeneous network interfaces.
- **Resilient Pipeline & UI Experience**: Crafting the streaming part-file assembler, crash-resilience journaling (`manifest.json`), live per-interface bandwidth visualizer, and Chrome companion extension.

UnCapped stands on the shoulders of this open-source engineering achievement and gratefully honors the original author's vision and codebase.

---

## 14. License & Usage Guide

UnCapped is open-source software licensed under the **[MIT License](LICENSE)**.

It is free for personal, educational, and commercial use. Users are encouraged to inspect, customize, and redistribute the application under the terms of the MIT License. A complete Plain-English Usage Guide, Acceptable Use Policy, and FAQ can be found in the [LICENSE](LICENSE) file.

