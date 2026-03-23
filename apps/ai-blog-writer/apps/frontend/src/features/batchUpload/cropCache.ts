/**
 * IndexedDB cache for cropped image variants.
 * Keyed by original filename — survives page refresh without causing one.
 */

const DB_NAME = 'bu_crops'
const STORE = 'crops'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'filename' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export interface StoredVariant {
  type: string
  blob: Blob
  name: string
}

export interface StoredCrop {
  filename: string
  variants: StoredVariant[]
}

export async function saveCrop(
  filename: string,
  variants: Array<{ type: string; file: File }>,
): Promise<void> {
  const db = await openDB()
  const record: StoredCrop = {
    filename,
    variants: variants.map((v) => ({ type: v.type, blob: v.file, name: v.file.name })),
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadCrop(filename: string): Promise<StoredCrop | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(filename)
    req.onsuccess = () => resolve((req.result as StoredCrop) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteCrop(filename: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(filename)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearAllCrops(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
