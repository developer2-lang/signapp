import { getDB, mutate, replaceDB } from '../lib/store';
import { uid } from '../lib/utils';
import type { Contact, PersonType } from '../types/contact';

export interface ContactInput {
  name: string;
  email: string;
  type: PersonType;
  designation: string;
  address: string;
}

export function listContacts(): Contact[] {
  return getDB().people;
}

export function saveContact(id: string | null, input: ContactInput): Contact {
  let result!: Contact;
  mutate((d) => {
    if (id) {
      const p = d.people.find((x) => x.id === id);
      if (p) {
        Object.assign(p, input);
        result = p;
      }
    } else {
      const p: Contact = { id: uid('per'), ...input };
      d.people.push(p);
      result = p;
    }
  });
  return result;
}

export function deleteContact(id: string): void {
  mutate((d) => {
    d.people = d.people.filter((p) => p.id !== id);
  });
}

export function exportData(): void {
  const blob = new Blob([JSON.stringify(getDB(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `iuova-sign-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

export async function importData(file: File): Promise<void> {
  const text = await file.text();
  const d = JSON.parse(text) as unknown;
  if (!d || typeof d !== 'object' || !('envelopes' in d) || !('templates' in d)) {
    throw new Error('Invalid backup file');
  }
  replaceDB(d as Parameters<typeof replaceDB>[0]);
}

export function wipeData(): void {
  const db = getDB();
  replaceDB({
    settings: db.settings,
    templates: db.templates,
    people: [],
    envelopes: [],
  });
}
