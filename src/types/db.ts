import type { Settings } from './settings';
import type { Template } from './template';
import type { Contact } from './contact';
import type { Envelope } from './envelope';

/** Root application database, persisted as a single JSON document. */
export interface AppDB {
  settings: Settings;
  templates: Template[];
  people: Contact[];
  envelopes: Envelope[];
}
