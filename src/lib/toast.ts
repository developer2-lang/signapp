import { useSyncExternalStore } from 'react';
import { toErrorMessage } from './utils';

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

export function pushToast(text: string | unknown): void {
  const message = typeof text === 'string' ? text : toErrorMessage(text, 'Something went wrong');
  const id = ++seq;
  toasts = [...toasts, { id, text: message }];
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
