import type { AppDB } from '../types/db';

/**
 * Persistence layer. The original app referenced a global `window.storage`;
 * this is the local implementation backed by localStorage. The async signature
 * is intentional so it can later be swapped for a Supabase-backed store without
 * touching the call sites in the store / services.
 */
const KEY = 'iuova_sign_db_v1';

export async function loadRaw(): Promise<AppDB | null> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AppDB) : null;
  } catch {
    return null;
  }
}

export async function saveRaw(json: string): Promise<void> {
  localStorage.setItem(KEY, json);
}
