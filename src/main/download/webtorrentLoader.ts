/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Safe loader and runtime patch for WebTorrent.
 *
 * WebTorrent's internal Torrent implementation sets `this.client = null` when a torrent
 * is destroyed. However, asynchronous operations (peer wire messages, ut_metadata extension,
 * DHT port announcements, piece verification, and store callbacks) may already be scheduled
 * on the Node.js event loop. When those callbacks fire on a destroyed torrent, accessing
 * `this.client._debugId`, `this.client.dht`, or `this.client.maxConns` throws unhandled
 * TypeErrors ("Cannot read properties of null").
 *
 * This module monkey-patches `Torrent.prototype` methods to guard against destroyed/null clients
 * and assigns a safe dummy client on teardown, preventing uncaught exceptions and crashes.
 */

let patchApplied = false

const DUMMY_CLIENT = Object.freeze({
  _debugId: 'destroyed',
  dht: null,
  maxConns: 0,
  utPex: false,
  seedOutgoingConnections: false,
  emit: () => {},
  _remove: () => {}
})

export async function patchWebTorrent(): Promise<void> {
  if (patchApplied) return
  patchApplied = true

  try {
    // Dynamically import Torrent prototype to patch it directly
    const TorrentMod = await import('webtorrent/lib/torrent.js')
    const Torrent = TorrentMod.default || TorrentMod
    if (!Torrent?.prototype) return

    const proto = Torrent.prototype

    const origDebug = proto._debug
    proto._debug = function (...args: any[]) {
      if (!this.client) return
      try {
        return origDebug.apply(this, args)
      } catch {
        // Suppress debug logging errors after or during destruction
      }
    }

    const origOnWireWithMetadata = proto._onWireWithMetadata
    proto._onWireWithMetadata = function (wire: any) {
      if (this.destroyed || !this.client) return
      try {
        return origOnWireWithMetadata.call(this, wire)
      } catch (err) {
        if (this.destroyed || !this.client) return
        throw err
      }
    }

    const origOnWire = proto._onWire
    proto._onWire = function (...args: any[]) {
      if (this.destroyed || !this.client) return
      try {
        return origOnWire.apply(this, args)
      } catch (err) {
        if (this.destroyed || !this.client) return
        throw err
      }
    }

    const origOnStore = proto._onStore
    proto._onStore = function (...args: any[]) {
      if (this.destroyed || !this.client) return
      try {
        return origOnStore.apply(this, args)
      } catch (err) {
        if (this.destroyed || !this.client) return
        throw err
      }
    }

    const origOnMetadata = proto._onMetadata
    proto._onMetadata = function (metadata: any) {
      if (this.destroyed || !this.client) return
      try {
        return origOnMetadata.call(this, metadata)
      } catch (err) {
        if (this.destroyed || !this.client) return
        throw err
      }
    }

    const origDrain = proto._drain
    proto._drain = function (...args: any[]) {
      if (this.destroyed || !this.client) return
      try {
        return origDrain.apply(this, args)
      } catch (err) {
        if (this.destroyed || !this.client) return
        throw err
      }
    }

    const origVerifyPiece = proto._verifyPiece
    if (typeof origVerifyPiece === 'function') {
      proto._verifyPiece = function (...args: any[]) {
        if (this.destroyed || !this.client) return
        try {
          return origVerifyPiece.apply(this, args)
        } catch (err) {
          if (this.destroyed || !this.client) return
          throw err
        }
      }
    }

    const origDestroy = proto._destroy
    proto._destroy = function (err: any, opts: any, cb: any) {
      try {
        return origDestroy.call(this, err, opts, cb)
      } finally {
        if (!this.client) {
          this.client = DUMMY_CLIENT as any
        }
      }
    }
  } catch (err) {
    console.warn('[WebTorrent patch warning]: could not patch Torrent prototype:', err)
  }
}

export async function getWebTorrent(): Promise<any> {
  try {
    await patchWebTorrent()
    const mod = await import('webtorrent')
    return mod.default || mod
  } catch {
    return null
  }
}
