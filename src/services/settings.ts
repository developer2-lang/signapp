import { getDB, mutate } from '../lib/store';
import { sha256 } from '../lib/utils';
import type { Settings } from '../types/settings';

const PIN_SALT = '|iuova-pin';

export async function verifyPin(pin: string): Promise<boolean> {
  const hash = await sha256(pin + PIN_SALT);
  return hash === getDB().settings.pinHash;
}

export async function setPin(pin: string): Promise<void> {
  const hash = await sha256(pin + PIN_SALT);
  mutate((d) => {
    d.settings.pinHash = hash;
  });
}

export async function changePin(cur: string, next: string): Promise<boolean> {
  if (!(await verifyPin(cur))) return false;
  await setPin(next);
  return true;
}

export async function removePin(cur: string): Promise<boolean> {
  if (!(await verifyPin(cur))) return false;
  mutate((d) => {
    d.settings.pinHash = null;
  });
  return true;
}

export function saveSettings(partial: Partial<Settings>): void {
  mutate((d) => {
    d.settings = { ...d.settings, ...partial };
  });
}
