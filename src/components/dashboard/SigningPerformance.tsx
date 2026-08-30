import { useEffect } from 'react';
import { useEnvelopes, refreshEnvelopes } from '../../lib/useEnvelopes';
import {
  hoursBetween,
  fmtHrs,
  isStale,
  isExpired,
} from '../../lib/utils';
import type { Envelope } from '../../types/envelope';

function avg(pairs: (number | null)[]): number | null {
  const v = pairs.filter((x) => x != null) as number[];
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function between(e: Envelope, a: string, b: string): number | null {
  const A = e.events.find((ev) => ev.type === a);
  const B = e.events.find((ev) => ev.type === b);
  return A && B ? hoursBetween(A.at, B.at) : null;
}

export function SigningPerformance() {
  const e = useEnvelopes();
  useEffect(() => {
    refreshEnvelopes();
  }, []);
  const dispatched = e.filter((x) => x.events.some((ev) => ev.type === 'sent'));
  const rate = dispatched.length
    ? Math.round((100 * dispatched.filter((x) => x.status === 'completed').length) / dispatched.length)
    : null;
  const avgSign = avg(e.map((x) => between(x, 'sent', 'signed')));
  const avgTotal = avg(e.map((x) => between(x, 'sent', 'completed')));
  const staleN = e.filter(isStale).length;
  const expN = e.filter(isExpired).length;

  const rateColor =
    rate === null ? 'var(--mute)' : rate >= 95 ? 'var(--ok)' : rate >= 80 ? 'var(--warn)' : 'var(--danger)';

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 14, marginBottom: 12 }}>Signing performance</h3>
      <div className="perf">
        <div className="p">
          <div className="n" style={{ color: rateColor }}>
            {rate === null ? '—' : `${rate}%`}
          </div>
          <div className="l">Completion rate</div>
        </div>
        <div className="p">
          <div className="n">{fmtHrs(avgSign)}</div>
          <div className="l">Avg send → sign</div>
        </div>
        <div className="p">
          <div className="n">{fmtHrs(avgTotal)}</div>
          <div className="l">Avg total turnaround</div>
        </div>
        <div className="p">
          <div className="n" style={{ color: staleN ? 'var(--warn)' : 'var(--ink)' }}>
            {staleN}
          </div>
          <div className="l">Stale (&gt;72h)</div>
        </div>
        <div className="p">
          <div className="n" style={{ color: expN ? 'var(--danger)' : 'var(--ink)' }}>
            {expN}
          </div>
          <div className="l">Expired</div>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Benchmark: industry completion target is 95%+; ~80% of e-signed agreements complete within a
        day. Stale envelopes are the ones to nudge.
      </p>
    </div>
  );
}
