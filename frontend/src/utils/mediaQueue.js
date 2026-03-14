/**
 * DealerSuite — Offline Media Queue (IndexedDB)
 *
 * When a Drive upload fails (network down, token expired), the media item
 * is stored locally in IndexedDB. A background listener retries all queued
 * items when the connection is restored.
 *
 * Schema:
 *   DB: ds_media_queue   Store: pending_uploads
 *   { id (auto), inspectionId, blob, mediaType, mimeType,
 *     damageLocation, filename, timestamp, retries }
 */

const DB_NAME    = 'ds_media_queue'
const STORE_NAME = 'pending_uploads'
const DB_VERSION = 1

// ── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess  = (e) => resolve(e.target.result)
    req.onerror    = (e) => reject(e.target.error)
  })
}

export async function enqueueMedia(item) {
  const db    = await openDB()
  const tx    = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  return new Promise((resolve, reject) => {
    const req = store.add({ ...item, timestamp: Date.now(), retries: 0 })
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function dequeueAll() {
  const db    = await openDB()
  const tx    = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  return new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function removeQueued(id) {
  const db    = await openDB()
  const tx    = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  return new Promise((resolve, reject) => {
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

export async function queuedCount() {
  const db    = await openDB()
  const tx    = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  return new Promise((resolve, reject) => {
    const req = store.count()
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}


// ── Canvas image compression ─────────────────────────────────────────────────

/**
 * Compress an image Blob using the Canvas API before uploading.
 * Reduces file size by resizing to maxDimension and re-encoding as JPEG.
 * Returns the original blob unchanged for video or if compression fails.
 */
export async function compressImage(blob, { maxDimension = 1920, quality = 0.82 } = {}) {
  if (!blob.type.startsWith('image/')) return blob   // skip video

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)

    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img

      // Scale down only — never upscale
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width)
          width  = maxDimension
        } else {
          width  = Math.round((width  * maxDimension) / height)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (compressed) => resolve(compressed || blob),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(blob)  // fall back to original on error
    }
    img.src = url
  })
}


// ── Online retry flusher ──────────────────────────────────────────────────────

let _retryHandler = null

/**
 * Start listening for online events; when the network comes back,
 * retry all queued uploads using the provided uploadFn.
 *
 * uploadFn(item) should return a Promise that resolves on success.
 * Call stopQueueFlusher() to unregister the listener.
 */
export function startQueueFlusher(uploadFn) {
  stopQueueFlusher()

  _retryHandler = async () => {
    const items = await dequeueAll().catch(() => [])
    for (const item of items) {
      try {
        await uploadFn(item)
        await removeQueued(item.id)
        console.info('[mediaQueue] flushed queued item', item.id)
      } catch (err) {
        console.warn('[mediaQueue] retry failed for item', item.id, err)
      }
    }
  }

  window.addEventListener('online', _retryHandler)
  // Also try immediately in case we're already online with a backlog
  if (navigator.onLine) _retryHandler()
}

export function stopQueueFlusher() {
  if (_retryHandler) {
    window.removeEventListener('online', _retryHandler)
    _retryHandler = null
  }
}
