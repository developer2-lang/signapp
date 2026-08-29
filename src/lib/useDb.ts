import { useSyncExternalStore } from 'react';
import { getDB, subscribe } from '../lib/store';
import type { AppDB } from '../types/db';

/** Subscribe a component to the shared DB store. */
export function useDb(): AppDB {
  return useSyncExternalStore(subscribe, getDB, getDB);
}
