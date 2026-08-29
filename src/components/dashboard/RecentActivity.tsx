import { useDb } from '../../lib/useDb';
import { fmt } from '../../lib/utils';

export function RecentActivity() {
  const db = useDb();
  const acts = db.envelopes
    .flatMap((x) => x.events.map((ev) => ({ ...ev, env: x.title })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  if (!acts.length) {
    return (
      <div className="empty">
        <div className="big">No activity yet</div>
        Create your first envelope from the Envelopes tab.
      </div>
    );
  }

  return (
    <>
      {acts.map((a, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: '1px solid var(--line)',
            gap: 10,
          }}
        >
          <div>
            <strong style={{ fontSize: 13 }}>{a.env}</strong>{' '}
            <span className="muted">— {a.label}</span>
          </div>
          <div className="muted" style={{ whiteSpace: 'nowrap' }}>
            {fmt(a.at)}
          </div>
        </div>
      ))}
    </>
  );
}
