# UnCapped Chrome & Chromium Extension 🚀

The **UnCapped Download Integration** extension bridges your web browser directly to the **UnCapped** desktop application, enabling automatic download acceleration across multiple bonded network interfaces (Wi-Fi, Ethernet, Mobile 4G/5G Hotspots) with zero manual link-copying.

---

## 🌟 Key Features

- ⚡ **Seamless Auto-Interception**: Automatically catches browser downloads and routes them directly into UnCapped for multi-network aggregation.
- 🎯 **File Size Threshold Filter**: Only send large files (e.g. >20 MB, >50 MB, >100 MB) to UnCapped while letting quick, small documents download directly in the browser.
- 🖱️ **Context Menu Action**: Right-click any download link or media asset and choose **"Download with UnCapped"**.
- 🍪 **Session & Cookie Forwarding**: Automatically forwards your authenticated session headers and cookies so authenticated/paywalled downloads (e.g., Google Drive, Mega, cloud storage) work effortlessly.
- 📡 **Live Status Indicator**: Popup shows real-time desktop app connection status and bonded network availability.

---

## 📥 Installation Guide

Compatible with **Google Chrome**, **Microsoft Edge**, **Brave**, **Arc**, **Opera**, and all Chromium-based browsers.

### Option 1: From Release Archive (Recommended)

1. Download **`uncapped-chrome-extension.zip`** from the latest [UnCapped Releases](https://github.com/VarunBissa/UnCapped/releases).
2. Extract the `.zip` file into a folder on your computer (e.g. `Downloads/uncapped-extension`).
3. Open your browser and navigate to the extensions page:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
4. In the top-right corner, turn **ON** **Developer mode**.
5. Click the **Load unpacked** button (top-left).
6. Select the folder where you extracted the extension (the folder containing `manifest.json`).
7. Click the Extensions (puzzle piece) icon in your browser toolbar and **pin** **UnCapped** for quick access.

---

### Option 2: From Source Repository

If you have cloned the UnCapped repository locally:
1. Open `chrome://extensions` (or your browser's extension page).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` directory located inside the root of the UnCapped repository.

---

## 🛠️ How to Use

1. **Launch the Desktop App**: Open **UnCapped** on your computer.
2. **Check Extension Status**:
   - Click the UnCapped icon in your browser toolbar.
   - The status badge will show **"Connected to UnCapped"** (green dot).
3. **Download Anything**:
   - Whenever you click a download button on any website, UnCapped intercepts the transfer immediately and splits it across your active network interfaces!
   - Alternatively, right-click any link and select **Download with UnCapped**.

---

## ⚙️ Extension Settings

Click the toolbar popup to configure:
- **Auto-Intercept Downloads**: Toggle ON/OFF automatic browser download capture.
- **Minimum File Size**: Choose when UnCapped steps in:
  - *All files* (Recommended)
  - *Files larger than 5 MB*
  - *Files larger than 20 MB*
  - *Files larger than 50 MB*
  - *Files larger than 100 MB*
- **Check Connection**: Quickly test the loopback bridge between your browser and the desktop app.

---

## ❓ Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **"UnCapped is not running"** | Ensure the UnCapped desktop application is opened on your computer. The extension communicates via local port `http://127.0.0.1:23851`. |
| **Browser warning about unpacked extension** | Chromium browsers show a warning for extensions installed in Developer Mode. This is normal for unpacked open-source extensions. Click "Keep" or dismiss. |
| **Download doesn't start** | If a website uses blob URLs or complex javascript blobs, right-click the final direct URL and choose **Download with UnCapped**. |

---

## 🔒 Privacy & Security

- All communication between the extension and UnCapped happens strictly over your local loopback address (`127.0.0.1`).
- No download URLs, cookies, or personal browsing data are ever transmitted to any third-party server or external cloud service.
