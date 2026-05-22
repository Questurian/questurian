/**
 * IndexedDB-backed persistence for the Add-flow Photo Import session (ADR-0007).
 *
 * Holds cropped variant Blobs + photographer credits across browser refreshes so
 * an operator who's halfway through 70 crops doesn't lose their work to a tab
 * reload. Scoped to a single session id per Add-flow instance; cleared on Create
 * success or explicit Reset. Survives same-browser refresh; does not migrate to
 * a different browser/machine (per the ADR — single-operator deployment).
 *
 * Keys are `(sessionId, sourceName, variantType)` for variants and
 * `(sessionId, sourceName)` for credits. Reads are scoped by sessionId.
 */

import type { ImageVariantType } from "@questurian/lm-shared";

const DB_NAME = "lm-add-flow-photo";
const DB_VERSION = 1;
const VARIANTS_STORE = "variants";
const CREDITS_STORE = "credits";
const SESSION_META_STORE = "sessions";

interface VariantRow {
  key: string;
  sessionId: string;
  sourceName: string;
  variantType: ImageVariantType;
  blob: Blob;
  filename: string;
  updatedAt: number;
}

interface CreditRow {
  key: string;
  sessionId: string;
  sourceName: string;
  credit: string;
  updatedAt: number;
}

interface SessionMetaRow {
  sessionId: string;
  category: string;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VARIANTS_STORE)) {
        const store = db.createObjectStore(VARIANTS_STORE, { keyPath: "key" });
        store.createIndex("bySession", "sessionId", { unique: false });
      }
      if (!db.objectStoreNames.contains(CREDITS_STORE)) {
        const store = db.createObjectStore(CREDITS_STORE, { keyPath: "key" });
        store.createIndex("bySession", "sessionId", { unique: false });
      }
      if (!db.objectStoreNames.contains(SESSION_META_STORE)) {
        db.createObjectStore(SESSION_META_STORE, { keyPath: "sessionId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function variantKey(sessionId: string, sourceName: string, variantType: ImageVariantType): string {
  return `${sessionId}::${sourceName}::${variantType}`;
}

function creditKey(sessionId: string, sourceName: string): string {
  return `${sessionId}::${sourceName}`;
}

function tx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => Promise<T> | T
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        let result: T;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error("IDB transaction aborted"));
        Promise.resolve(run(transaction))
          .then((value) => {
            result = value;
          })
          .catch((err) => {
            try {
              transaction.abort();
            } catch {
              /* already aborted */
            }
            reject(err);
          });
      })
  );
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface PersistedVariant {
  sourceName: string;
  variantType: ImageVariantType;
  blob: Blob;
  filename: string;
}

export interface PersistedSource {
  sourceName: string;
  credit: string | null;
  variants: PersistedVariant[];
}

export const addFlowPhotoSession = {
  /** Stable id for this Add-flow wizard instance. Caller persists in component state. */
  newSessionId(): string {
    return `add-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  },

  /** Register a session id with category for diagnostics; safe to call repeatedly. */
  async registerSession(sessionId: string, category: string): Promise<void> {
    await tx(SESSION_META_STORE, "readwrite", (t) => {
      const store = t.objectStore(SESSION_META_STORE);
      const row: SessionMetaRow = { sessionId, category, createdAt: Date.now() };
      store.put(row);
    });
  },

  /** Save (or overwrite) all variants for one source. */
  async putSourceVariants(
    sessionId: string,
    sourceName: string,
    variants: { variantType: ImageVariantType; file: File }[],
    credit: string | null
  ): Promise<void> {
    await tx([VARIANTS_STORE, CREDITS_STORE], "readwrite", (t) => {
      const vstore = t.objectStore(VARIANTS_STORE);
      const cstore = t.objectStore(CREDITS_STORE);
      const updatedAt = Date.now();
      for (const v of variants) {
        const row: VariantRow = {
          key: variantKey(sessionId, sourceName, v.variantType),
          sessionId,
          sourceName,
          variantType: v.variantType,
          blob: v.file,
          filename: v.file.name,
          updatedAt,
        };
        vstore.put(row);
      }
      if (credit !== null) {
        const row: CreditRow = {
          key: creditKey(sessionId, sourceName),
          sessionId,
          sourceName,
          credit,
          updatedAt,
        };
        cstore.put(row);
      }
    });
  },

  /** Remove one source's variants + credit (used on Drop or per-source clear). */
  async removeSource(sessionId: string, sourceName: string): Promise<void> {
    await tx([VARIANTS_STORE, CREDITS_STORE], "readwrite", async (t) => {
      const vstore = t.objectStore(VARIANTS_STORE);
      const cstore = t.objectStore(CREDITS_STORE);
      const idx = vstore.index("bySession");
      const cursor = idx.openCursor(IDBKeyRange.only(sessionId));
      await new Promise<void>((resolve, reject) => {
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return resolve();
          const row = c.value as VariantRow;
          if (row.sourceName === sourceName) c.delete();
          c.continue();
        };
      });
      cstore.delete(creditKey(sessionId, sourceName));
    });
  },

  /** Load every source's variants + credit for the session, keyed by sourceName. */
  async loadSession(sessionId: string): Promise<Map<string, PersistedSource>> {
    return tx([VARIANTS_STORE, CREDITS_STORE], "readonly", async (t) => {
      const vIdx = t.objectStore(VARIANTS_STORE).index("bySession");
      const cIdx = t.objectStore(CREDITS_STORE).index("bySession");

      const variants = (await reqToPromise(
        vIdx.getAll(IDBKeyRange.only(sessionId))
      )) as VariantRow[];
      const credits = (await reqToPromise(
        cIdx.getAll(IDBKeyRange.only(sessionId))
      )) as CreditRow[];

      const bySource = new Map<string, PersistedSource>();
      for (const v of variants) {
        const entry =
          bySource.get(v.sourceName) ??
          ({ sourceName: v.sourceName, credit: null, variants: [] } as PersistedSource);
        entry.variants.push({
          sourceName: v.sourceName,
          variantType: v.variantType,
          blob: v.blob,
          filename: v.filename,
        });
        bySource.set(v.sourceName, entry);
      }
      for (const c of credits) {
        const entry =
          bySource.get(c.sourceName) ??
          ({ sourceName: c.sourceName, credit: null, variants: [] } as PersistedSource);
        entry.credit = c.credit;
        bySource.set(c.sourceName, entry);
      }
      return bySource;
    });
  },

  /** Wipe everything stored under a session id (Create success, Reset, abandoned). */
  async clearSession(sessionId: string): Promise<void> {
    await tx(
      [VARIANTS_STORE, CREDITS_STORE, SESSION_META_STORE],
      "readwrite",
      async (t) => {
        for (const storeName of [VARIANTS_STORE, CREDITS_STORE]) {
          const store = t.objectStore(storeName);
          const idx = store.index("bySession");
          const cursor = idx.openCursor(IDBKeyRange.only(sessionId));
          await new Promise<void>((resolve, reject) => {
            cursor.onerror = () => reject(cursor.error);
            cursor.onsuccess = () => {
              const c = cursor.result;
              if (!c) return resolve();
              c.delete();
              c.continue();
            };
          });
        }
        t.objectStore(SESSION_META_STORE).delete(sessionId);
      }
    );
  },

  /**
   * Garbage-collect sessions older than the cutoff (default 7d). Call on Add
   * flow mount to keep IDB from accumulating abandoned wizard sessions.
   */
  async pruneOlderThan(cutoffMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const cutoff = Date.now() - cutoffMs;
    const stale: string[] = [];
    await tx(SESSION_META_STORE, "readonly", async (t) => {
      const all = (await reqToPromise(
        t.objectStore(SESSION_META_STORE).getAll()
      )) as SessionMetaRow[];
      for (const row of all) if (row.createdAt < cutoff) stale.push(row.sessionId);
    });
    for (const sessionId of stale) {
      await this.clearSession(sessionId);
    }
  },
};
