import { useSyncExternalStore } from 'react';

export interface ToastItem {
  id: number;
  text: string;
}

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
let seq = 0;

function emit() {
  listeners.forEach((l) => l());
}

export function pushToast(text: string): void {
  const id = ++seq;
  toasts = [...toasts, { id, text }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 2600);
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
}
