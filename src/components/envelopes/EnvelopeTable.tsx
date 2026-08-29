import { StatusBadge } from '../ui/StatusBadge';
import { useDb } from '../../lib/useDb';
import { fmt, isExpired } from '../../lib/utils';
import type { Envelope } from '../../types/envelope';

export function EnvelopeTable({
  rows,
  onOpen,
}: {
  rows: Envelope[];
  onOpen: (id: string) => void;
}) {
  const db = useDb();
  if (!rows.length) {
    const emptyMsg = db.envelopes.length
      ? 'No envelopes match your filter'
      : 'No envelopes yet';
    const sub = db.envelopes.length
      ? 'Try clearing the search or status filter.'
      : 'Click “New envelope” to draft, merge and send your first document.';
    return (
      <div className="empty">
        <div className="big">{emptyMsg}</div>
        {sub}
      </div>
    );
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Document</th>
          <th>Signer</th>
          <th>Status</th>
          <th>Updated</th>
          <th>Access code</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((x) => (
          <tr className="rowlink" key={x.id} onClick={() => onOpen(x.id)}>
            <td>
              <strong>{x.title}</strong>
            </td>
            <td>
              {x.signerName}
              <div className="muted">{x.signerEmail}</div>
            </td>
            <td>
              <StatusBadge status={isExpired(x) ? 'expired' : x.status} />
              {x.reminders ? (
                <div className="muted" style={{ marginTop: 3 }}>
                  {x.reminders} reminder{x.reminders > 1 ? 's' : ''}
                </div>
              ) : null}
            </td>
            <td className="muted">{fmt(x.updatedAt)}</td>
            <td>
              <span className="hash-chip">
                {x.status === 'sent' && !isExpired(x) ? x.token : '—'}
              </span>
            </td>
            <td style={{ textAlign: 'right' }}>
              <button
                className="btn ghost sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(x.id);
                }}
              >
                Open
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
