import type { AppDB } from '../types/db';
import { DEFAULTS } from './seed';
import { loadRaw, saveRaw } from '../services/storage';

/**
 * In-memory store mirroring the original global `DB`. Mutations go through
 * `mutate`, which clones the top-level reference (so React's
 * useSyncExternalStore detects a change) and schedules a debounced persistence.
 */
let db: AppDB = structuredClone(DEFAULTS);
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getDB(): AppDB {
  return db;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function mutate(fn: (d: AppDB) => void): void {
  fn(db);
  db = { ...db };
  listeners.forEach((l) => l());
  scheduleSave();
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const json = JSON.stringify(db);
      if (json.length > 4_700_000) {
        console.warn('Storage nearly full — export a backup');
      }
      await saveRaw(json);
    } catch (e) {
      console.error('Could not save — storage error', e);
    }
  }, 250);
}

export async function initDB(): Promise<void> {
  try {
    const r = await loadRaw();
    db = r ? r : structuredClone(DEFAULTS);
  } catch {
    db = structuredClone(DEFAULTS);
  }
  if (!db.settings) db.settings = structuredClone(DEFAULTS.settings);
  listeners.forEach((l) => l());
}

/** Replace the entire DB (used by import / wipe). */
export function replaceDB(next: AppDB): void {
  db = structuredClone(next);
  listeners.forEach((l) => l());
  scheduleSave();
}
