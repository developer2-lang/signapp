import { useDb } from '../../lib/useDb';
import { esc, fmt } from '../../lib/utils';
import type { Envelope } from '../../types/envelope';
import type { Signature } from '../../types/signature';

function SigSlot({
  sig,
  who,
  title,
}: {
  sig: Signature | null;
  who: string;
  title: string;
}) {
  return (
    <div className="sig-slot">
      <div className="line">
        {sig
          ? sig.mode === 'typed'
            ? <span className="typed">{esc(sig.text)}</span>
            : <img src={sig.dataURL} alt="signature" />
          : ''}
      </div>
      <div className="who">{who}</div>
      <div className="meta">
        {sig ? `${title} · ${fmt(sig.at)}` : `${title.replace('Digitally', '').trim()} pending`}
      </div>
      {sig ? <div className="meta">sig-hash {sig.hash.slice(0, 16)}…</div> : ''}
    </div>
  );
}

export function DocumentViewer({ env }: { env: Envelope }) {
  const db = useDb();
  const s = db.settings;
  // Prefer the recipients list when available; fall back to the single signer.
  const recipients = env.recipients.length > 0
    ? env.recipients.slice().sort((a, b) => a.order - b.order)
    : [];
  const cs = env.countersignature;
  const header = env.letterhead ? (
    <div className="lh-img">
      <img src={env.letterhead} alt="letterhead" />
      <small>ENVELOPE {env.id.toUpperCase()}</small>
    </div>
  ) : (
    <div className="lh">
      {esc(s.company).toUpperCase()}
      <small>
        {esc(s.address)} · ENVELOPE {env.id.toUpperCase()}
      </small>
    </div>
  );
  return (
    <div className="doc-paper">
      {header}
      {esc(env.body)}
      <div className="sig-block">
        {recipients.map((r) => (
          <SigSlot
            key={r.id}
            sig={r.signature}
            who={esc(r.name)}
            title={r.role === 'countersigner' ? 'Digitally countersigned' : 'Digitally signed'}
          />
        ))}
        {recipients.length === 0 && (
          <SigSlot sig={env.signature} who={esc(env.signerName)} title="Digitally signed" />
        )}
        {!recipients.some((r) => r.role === 'countersigner') && (
          <SigSlot
            sig={cs}
            who={`${esc(s.signerName)} — ${esc(s.signerTitle)}`}
            title="Digitally countersigned"
          />
        )}
      </div>
    </div>
  );
}
