/**
 * Where a day's Fill-In Ideas document lives between sessions.
 *
 * IndexedDB rather than the draft. Each run comes back around 30KB of HTML, and
 * a seven-day trip is a quarter of a megabyte — inside the one localStorage
 * value that `createDraftStorage` rewrites on every keystroke-driven save, next
 * to every other draft. A quota error there is not a lost document, it is a lost
 * itinerary, and nothing in that path catches one.
 *
 * So the draft keeps only the fact that a day ran (`fillIdeaRuns`) and the
 * documents live here, keyed by draft and day. The two can disagree — clearing
 * site data wipes this and not that — and the caller is expected to cope: a
 * missing document means the next day's prompt is built without that day's
 * suggestions, not that the chain is broken.
 */

const DB_NAME = 'abw_listicle_itineraries'
const DB_VERSION = 1
const STORE = 'fill_ideas'

export type StoredFillIdeasDocument = {
  key: string
  draftId: string
  dayId: string
  html: string
  /** The document as plain text, for feeding the next day's prompt. */
  text: string
  modelUsed: string
  ranAt: string
}

const documentKey = (draftId: string, dayId: string) => `${draftId}::${dayId}`

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = run(transaction.objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

/**
 * Strip a model-authored HTML document down to its words.
 *
 * `DOMParser` builds a detached document: nothing in it loads, runs, or renders,
 * which is what makes this safe to point at HTML that was assembled from pages
 * the model read on the open web. Style and script content is dropped rather
 * than read as text, because `textContent` on a document would otherwise return
 * the whole CSS block as prose.
 */
export function htmlToPlainText(html: string): string {
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    parsed.querySelectorAll('style, script, head').forEach((node) => node.remove())
    return (parsed.body?.textContent ?? '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch {
    return ''
  }
}

export async function saveFillIdeasDocument(
  document: Omit<StoredFillIdeasDocument, 'key'>,
): Promise<void> {
  try {
    await withStore('readwrite', (store) =>
      store.put({
        ...document,
        key: documentKey(document.draftId, document.dayId),
      }) as IDBRequest<IDBValidKey>,
    )
  } catch {
    // A document we could not keep is a re-run, not a broken builder. The
    // draft's own run record is what gates the next day, and it is already
    // saved by the time this runs.
  }
}

export async function loadFillIdeasDocument(
  draftId: string,
  dayId: string,
): Promise<StoredFillIdeasDocument | null> {
  try {
    const found = await withStore<StoredFillIdeasDocument | undefined>(
      'readonly',
      (store) => store.get(documentKey(draftId, dayId)),
    )
    return found ?? null
  } catch {
    return null
  }
}

/** Every stored day for one draft, for building a later day's prompt. */
export async function loadFillIdeasDocuments(
  draftId: string,
  dayIds: string[],
): Promise<Map<string, StoredFillIdeasDocument>> {
  const found = new Map<string, StoredFillIdeasDocument>()
  for (const dayId of dayIds) {
    const document = await loadFillIdeasDocument(draftId, dayId)
    if (document) found.set(dayId, document)
  }
  return found
}
