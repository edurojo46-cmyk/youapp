import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { ContentItem, CandidatePool } from '../types';

interface YouAppDB extends DBSchema {
  cache: {
    key: string;
    value: {
      key: string;
      value: any;
      expiresAt: number;
    };
  };
  catalog: {
    key: string;
    value: ContentItem;
    indexes: {
      'by-provider': string;
    };
  };
  candidate_pool: {
    key: string;
    value: CandidatePool;
  };
  embeddings: {
    key: string;
    value: {
      id: string;
      vector: number[];
      model: string;
      updatedAt: number;
    };
  };
}

const DB_NAME = 'youapp-db';
const DB_VERSION = 2; // Upgraded to v2 with 4 stores

let dbPromise: Promise<IDBPDatabase<YouAppDB>> | null = null;

export async function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<YouAppDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('cache', { keyPath: 'key' });
          const catalogStore = db.createObjectStore('catalog', { keyPath: 'id' });
          catalogStore.createIndex('by-provider', 'provider');
        }
        
        // Migration from V1 to V2
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('candidate_pool')) {
            db.createObjectStore('candidate_pool', { keyPath: 'normalizedQuery' });
          }
          if (!db.objectStoreNames.contains('embeddings')) {
            db.createObjectStore('embeddings', { keyPath: 'id' });
          }
          // If search_cache exists from V1, we could drop it or migrate it, but let's just create new ones
          if (db.objectStoreNames.contains('search_cache' as any)) {
            db.deleteObjectStore('search_cache' as any);
          }
        }
      }
    });
  }
  return dbPromise;
}

export async function getCandidatePool(query: string): Promise<CandidatePool | null> {
  try {
    const db = await getDb();
    const pool = await db.get('candidate_pool', query);
    if (pool && pool.expiresAt > Date.now()) {
      return pool;
    }
  } catch (error) {
    console.error("IndexedDB Error:", error);
  }
  return null;
}

export async function saveCandidatePool(pool: CandidatePool) {
  try {
    const db = await getDb();
    await db.put('candidate_pool', pool);
  } catch (error) {
    console.error("IndexedDB Error:", error);
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const db = await getDb();
    const cached = await db.get('cache', key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
  } catch (error) {
    console.error("IndexedDB Error:", error);
  }
  return null;
}

export async function setCache<T>(key: string, value: T, ttlMs: number) {
  try {
    const db = await getDb();
    await db.put('cache', {
      key,
      value,
      expiresAt: Date.now() + ttlMs
    });
  } catch (error) {
    console.error("IndexedDB Error:", error);
  }
}
