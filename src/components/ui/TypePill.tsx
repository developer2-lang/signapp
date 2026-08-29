import type { PersonType } from '../../types/contact';

export function TypePill({ type }: { type: PersonType }) {
  return <span className={`pill ${type === 'vendor' ? 'sent' : 'completed'}`}>{type}</span>;
}
