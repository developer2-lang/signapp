import { useEffect } from 'react';
import { useEnvelopes, refreshEnvelopes } from '../../lib/useEnvelopes';
import { isExpired } from '../../lib/utils';

export function DashboardStats() {
  const e = useEnvelopes();
  useEffect(() => {
    refreshEnvelopes();
  }, []);
  const counts = {
    sent: e.filter((x) => x.status === 'sent' && !isExpired(x)).length,
    signed: e.filter((x) => x.status === 'signed').length,
    completed: e.filter((x) => x.status === 'completed').length,
    total: e.length,
  };
  return (
    <div className="grid g4">
      <div className="card stat">
        <div className="n">{counts.total}</div>
        <div className="l">Total envelopes</div>
      </div>
      <div className="card stat">
        <div className="n" style={{ color: 'var(--cobalt)' }}>
          {counts.sent}
        </div>
        <div className="l">Awaiting signer</div>
      </div>
      <div className="card stat">
        <div className="n" style={{ color: 'var(--warn)' }}>
          {counts.signed}
        </div>
        <div className="l">Counter-signature pending</div>
      </div>
      <div className="card stat">
        <div className="n" style={{ color: 'var(--ok)' }}>
          {counts.completed}
        </div>
        <div className="l">Completed</div>
      </div>
    </div>
  );
}
