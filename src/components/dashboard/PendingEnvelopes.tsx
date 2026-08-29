import { useDb } from '../../lib/useDb';
import { isStale, isExpired, fmt } from '../../lib/utils';
import { nudgeEnvelope, extendEnvelope } from '../../services/envelopes';
import { openReminderMail } from '../../lib/mail';
import { pushToast } from '../../lib/toast';
import type { Envelope } from '../../types/envelope';

export function PendingEnvelopes({
  onOpenEnvelope,
}: {
  onOpenEnvelope: (id: string) => void;
}) {
  const db = useDb();
  const items: { x: Envelope; kind: 'counter' | 'stale' | 'expired' }[] = [];
  db.envelopes.filter((x) => x.status === 'signed').forEach((x) => items.push({ x, kind: 'counter' }));
  db.envelopes.filter(isStale).forEach((x) => items.push({ x, kind: 'stale' }));
  db.envelopes.filter(isExpired).forEach((x) => items.push({ x, kind: 'expired' }));

  if (!items.length) {
    return (
      <div className="empty">
        <div className="big">Nothing pending on your side</div>
        Countersignatures, stale envelopes and expiries will appear here.
      </div>
    );
  }

  const nudge = (x: Envelope) => {
    nudgeEnvelope(x.id);
    const fresh = db.envelopes.find((e) => e.id === x.id);
    if (fresh) openReminderMail(fresh, db.settings);
    pushToast(`Reminder #${fresh?.reminders ?? 1} logged — email draft opened`);
  };

  return (
    <>
      {items.map(({ x, kind }) => {
        if (kind === 'counter') {
          return (
            <div
              key={x.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid var(--line)',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <strong>{x.title}</strong>
                <div className="muted">
                  {x.signerName} signed{' '}
                  {fmt(
                    x.events.find((ev) => ev.type === 'signed')?.at || x.updatedAt,
                  )}{' '}
                  · your countersignature is pending
                </div>
              </div>
              <button className="btn primary sm" onClick={() => onOpenEnvelope(x.id)}>
                Countersign →
              </button>
            </div>
          );
        }
        if (kind === 'stale') {
          return (
            <div
              key={x.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid var(--line)',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <strong>{x.title}</strong>
                <div className="muted">
                  Sent to {x.signerName}, no activity for 72h+{' '}
                  {x.reminders ? `· ${x.reminders} reminder${x.reminders > 1 ? 's' : ''} sent` : ''}
                </div>
              </div>
              <button className="btn ghost sm" onClick={() => nudge(x)}>
                Send reminder ✉
              </button>
            </div>
          );
        }
        return (
          <div
            key={x.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: '1px solid var(--line)',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <strong>{x.title}</strong>
              <div className="muted">
                Access code expired {fmt(x.expiresAt || '')} — {x.signerName} can no longer sign
              </div>
            </div>
            <button className="btn ghost sm" onClick={() => extendEnvelope(x.id)}>
              Extend +7 days
            </button>
          </div>
        );
      })}
    </>
  );
}
