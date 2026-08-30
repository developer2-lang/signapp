import { useEffect } from 'react';
import { useEnvelopes, refreshEnvelopes } from '../../lib/useEnvelopes';
import { isStale, isExpired, fmt } from '../../lib/utils';
import { sendEnvelopeEmail } from '../../services/email';
import { adminExtend } from '../../services/envelopes';
import { pushToast } from '../../lib/toast';
import type { Envelope } from '../../types/envelope';

export function PendingEnvelopes({
  onOpenEnvelope,
}: {
  onOpenEnvelope: (id: string) => void;
}) {
  const items = useEnvelopes();
  useEffect(() => {
    refreshEnvelopes();
  }, []);

  const rows: { x: Envelope; kind: 'counter' | 'stale' | 'expired' }[] = [];
  items.filter((x) => x.status === 'signed').forEach((x) => rows.push({ x, kind: 'counter' }));
  items.filter(isStale).forEach((x) => rows.push({ x, kind: 'stale' }));
  items.filter(isExpired).forEach((x) => rows.push({ x, kind: 'expired' }));

  if (!rows.length) {
    return (
      <div className="empty">
        <div className="big">Nothing pending on your side</div>
        Countersignatures, stale envelopes and expiries will appear here.
      </div>
    );
  }

  const resend = async (x: Envelope) => {
    const res = await sendEnvelopeEmail(x.id);
    if (res.ok) {
      pushToast('Reminder email sent ✓');
      refreshEnvelopes();
    } else {
      pushToast(res.error || 'Email failed');
    }
  };

  const extend = async (x: Envelope) => {
    const e = await adminExtend(x.id, 7);
    pushToast('Expiry extended +7 days');
    refreshEnvelopes();
    onOpenEnvelope(e.id);
  };

  return (
    <>
      {rows.map(({ x, kind }) => {
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
                  {fmt(x.events.find((ev) => ev.type === 'signed')?.at || x.updatedAt)} · your
                  countersignature is pending
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
              <button className="btn ghost sm" onClick={() => resend(x)}>
                Resend email ✉
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
            <button className="btn ghost sm" onClick={() => extend(x)}>
              Extend +7 days
            </button>
          </div>
        );
      })}
    </>
  );
}
