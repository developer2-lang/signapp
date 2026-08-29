import type { DisplayStatus } from '../../types/envelope';
import { statusMeta } from '../../lib/utils';

export function StatusBadge({ status }: { status: DisplayStatus }) {
  const m = statusMeta(status);
  return <span className={`pill ${m.cls}`}>{m.label}</span>;
}
