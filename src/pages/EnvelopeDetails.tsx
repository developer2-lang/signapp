import { useState } from 'react';
import { useDb } from '../lib/useDb';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Modal } from '../components/ui/Modal';
import { DocumentViewer } from '../components/signing/DocumentViewer';
import { CountersignModal } from '../components/signing/CountersignModal';
import {
  sendDraft,
  nudgeEnvelope,
  extendEnvelope,
  voidEnvelope,
  verifyEnvelope,
  getEnvelope,
} from '../services/envelopes';
import { openSendMail } from '../lib/mail';
import { isExpired, fmt, esc } from '../lib/utils';
import { downloadPDF } from '../lib/pdf';
import { pushToast } from '../lib/toast';
import type { Envelope } from '../types/envelope';

export function EnvelopeDetails({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const db = useDb();
  const env = db.envelopes.find((x) => x.id === id);
  const [counterOpen, setCounterOpen] = useState(false);
  const [verify, setVerify] = useState<{ ok: boolean; stored: string | null; recomputed: string } | null>(
    null,
  );
  const [sendInfo, setSendInfo] = useState<Envelope | null>(null);

  if (!env) {
    return (
      <div className="card">
        <button className="btn ghost sm" onClick={onBack}>
          ← All envelopes
        </button>
        <div className="empty">
          <div className="big">Envelope not found</div>
        </div>
      </div>
    );
  }

  const expired = isExpired(env);
  const disp = expired ? 'expired' : env.status;
  const canSend = env.status === 'draft';
  const canCounter = env.status === 'signed';
  const isDone = env.status === 'completed';

  const doSend = async () => {
    const e = await sendDraft(env.id);
    if (e) {
      setSendInfo(e);
      pushToast('Envelope sent');
    }
  };

  const doRemind = () => {
    nudgeEnvelope(env.id);
    const fresh = getEnvelope(env.id);
    if (fresh) openSendMail(fresh, db.settings);
    pushToast(`Reminder #${fresh?.reminders ?? 1} logged — email draft opened`);
  };

  const doVerify = async () => {
    const r = await verifyEnvelope(env.id);
    if (r) setVerify(r);
  };

  return (
    <>
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 14 }}>
        ← All envelopes
      </button>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div>
          <h2 style={{ fontSize: 20 }}>{esc(env.title)}</h2>
          <div className="muted" style={{ marginTop: 4 }}>
            Envelope <span className="mono">{env.id}</span> · created {fmt(env.createdAt)}
            {env.expiresAt && env.status === 'sent'
              ? ` · ${expired ? 'expired' : 'valid till'} ${fmt(env.expiresAt)}`
              : ''}
            {env.reminders ? ` · ${env.reminders} reminder${env.reminders > 1 ? 's' : ''}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={disp} />
          {canSend && (
            <button className="btn primary sm" onClick={doSend}>
              Send for signature
            </button>
          )}
          {env.status === 'sent' && !expired && (
            <>
              <button
                className="btn ghost sm"
                onClick={() => navigator.clipboard.writeText(env.token).then(() => pushToast('Code copied'))}
              >
                Copy access code
              </button>
              <button className="btn ghost sm" onClick={doRemind}>
                Send reminder ✉
              </button>
            </>
          )}
          {expired && (
            <button className="btn primary sm" onClick={() => extendEnvelope(env.id)}>
              Extend +7 days
            </button>
          )}
          {canCounter && (
            <button className="btn primary sm" onClick={() => setCounterOpen(true)}>
              Countersign now
            </button>
          )}
          {isDone && (
            <button className="btn primary sm" onClick={() => downloadPDF(env.id)}>
              Download signed PDF
            </button>
          )}
          {isDone && (
            <button className="btn ghost sm" onClick={doVerify}>
              Verify integrity
            </button>
          )}
          {env.status !== 'completed' && (
            <button
              className="btn danger sm"
              onClick={() => {
                if (confirm('Void this envelope? The access code stops working.')) voidEnvelope(env.id);
              }}
            >
              Void
            </button>
          )}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div>
          <DocumentViewer env={env} />
        </div>
        <div>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>Chain of custody</h3>
            <p className="muted" style={{ marginBottom: 12 }}>
              Every action is timestamped and hash-sealed. This is the evidence record under §65B,
              Indian Evidence Act.
            </p>
            <div className="rail">
              {env.events.map((ev, i) => (
                <div className="ev done" key={i}>
                  <div className="t">{esc(ev.label)}</div>
                  <div className="m">
                    {fmt(ev.at)}
                    {ev.hash ? (
                      <>
                        <br />
                        sha256 · <span title={ev.hash}>{ev.hash.slice(0, 20)}…</span>
                      </>
                    ) : null}
                    {ev.ua ? (
                      <>
                        <br />
                        {esc(ev.ua.slice(0, 60))}…
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              {env.status === 'sent' && (
                <div className="ev">
                  <div className="t" style={{ color: 'var(--mute)' }}>
                    Awaiting recipient signature
                  </div>
                </div>
              )}
              {env.status === 'signed' && (
                <div className="ev">
                  <div className="t" style={{ color: 'var(--warn)' }}>
                    Awaiting countersignature
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <CountersignModal
        env={env}
        open={counterOpen}
        onClose={() => setCounterOpen(false)}
        onDone={() => {
          setCounterOpen(false);
          pushToast('Envelope completed ✓');
        }}
      />

      <Modal open={!!sendInfo} onClose={() => setSendInfo(null)}>
        {sendInfo && (
          <>
            <h3>Envelope sent ✓</h3>
            <p style={{ marginBottom: 10 }}>
              Share this access code with <strong>{esc(sendInfo.signerName)}</strong>. They enter it in
              the <strong>Signer portal</strong> to review and sign.
            </p>
            <div className="link-box">
              <code>{sendInfo.token}</code>
              <button
                className="btn ghost sm"
                onClick={() =>
                  navigator.clipboard.writeText(sendInfo.token).then(() => pushToast('Code copied'))
                }
              >
                Copy
              </button>
            </div>
            <div className="notice">
              Running as a local tool: email dispatch is prepared via your mail client. When deployed to a
              server, this becomes an automatic email with a one-click signing link.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <a
                className="btn ghost"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  openSendMail(sendInfo, db.settings);
                }}
              >
                Open email draft
              </a>
              <button className="btn primary" onClick={() => setSendInfo(null)}>
                Done
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!verify} onClose={() => setVerify(null)}>
        {verify && (
          <>
            <h3>{verify.ok ? '✓ Integrity verified' : '✗ Integrity check FAILED'}</h3>
            <p style={{ marginBottom: 12 }}>
              {verify.ok
                ? 'The document text is byte-identical to what was sealed at the time of sending. No tampering detected.'
                : 'The stored text no longer matches the sealed fingerprint. Treat this record as compromised.'}
            </p>
            <div className="field">
              <label>Sealed at send</label>
              <span className="hash-chip">{verify.stored}</span>
            </div>
            <div className="field">
              <label>Recomputed now</label>
              <span
                className="hash-chip"
                style={verify.ok ? undefined : { background: 'var(--danger-soft)', color: 'var(--danger)' }}
              >
                {verify.recomputed}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn primary" onClick={() => setVerify(null)}>
                Close
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
