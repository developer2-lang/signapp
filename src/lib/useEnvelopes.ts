import { useSyncExternalStore } from 'react';
import { listEnvelopes } from '../services/envelopes';
import type { Envelope } from '../types/envelope';

let envelopes: Envelope[] = [];
const listeners = new Set<() => void>();
let loading = false;

function emit() {
  listeners.forEach((l) => l());
}

export async function refreshEnvelopes(): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    envelopes = await listEnvelopes();
  } catch (e) {
    console.error('Failed to load envelopes', e);
  } finally {
    loading = false;
    emit();
  }
}

export function useEnvelopes(): Envelope[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => envelopes,
    () => envelopes,
  );
}
