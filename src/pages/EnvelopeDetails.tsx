import { useEffect, useState } from 'react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Modal } from '../components/ui/Modal';
import { DocumentViewer } from '../components/signing/DocumentViewer';
import {
  getEnvelope,
  adminVoid,
  adminExtend,
  verifyEnvelope,
  type VerifyResult,
} from '../services/envelopes';
import { CountersignModal } from '../components/signing/CountersignModal';
import { sendEnvelopeEmail } from '../services/email';
import { refreshEnvelopes } from '../lib/useEnvelopes';
import { isExpired, fmt, esc } from '../lib/utils';
import { downloadPDF } from '../lib/pdf';
import { pushToast } from '../lib/toast';
import type { Envelope, EnvelopeRecipient } from '../types/envelope';

function appUrl(): string {
  return (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
}

const ROLE_LABEL: Record<string, string> = {
  signer: 'Signer',
  countersigner: 'Countersigner',
};

function recipientState(r: EnvelopeRecipient): { icon: string; text: string; color: string } {
  switch (r.status) {
    case 'signed':
      return { icon: '✓', text: `Signed: ${fmt(r.signedAt || '')}`, color: 'var(--ok)' };
    case 'active':
      return { icon: '→', text: 'Waiting for action', color: 'var(--cobalt)' };
    case 'declined':
      return { icon: '✗', text: 'Declined', color: 'var(--danger)' };
    default:
      return { icon: '○', text: 'Pending', color: 'var(--mute)' };
  }
}

export function EnvelopeDetails({ id, onBack }: { id: string; onBack: () => void }) {
  const [env, setEnv] = useState<Envelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [sending, setSending] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);

  const load = () => {
    setLoading(true);
    getEnvelope(id)
      .then((e) => setEnv(e))
      .catch((e) => pushToast(e instanceof Error ? e.message : 'Failed to load envelope'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="card">
        <button className="btn ghost sm" onClick={onBack}>
          ← All envelopes
        </button>
        <div className="empty">
          <div className="big">Loading…</div>
        </div>
      </div>
    );
  }

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
  const canResend = env.status === 'sent' || env.status === 'viewed' || env.status === 'signed';
  const isDone = env.status === 'completed';
  const isLegacy = env.signingMode == null;
  const signedCount = env.recipients.filter((r) => r.status === 'signed').length;
  const totalRecipients = env.recipients.length;

  const doSend = async () => {
    setSending(true);
    const res = await sendEnvelopeEmail(env.id);
    setSending(false);
    if (res.ok) {
      if (res.attachmentFailures && res.attachmentFailures > 0) {
        pushToast(`Envelope sent ✓ · ${res.attachmentFailures} attachment(s) were skipped`);
      } else {
        pushToast('Envelope sent ✓');
      }
      load();
      refreshEnvelopes();
    } else {
      pushToast(res.error || 'Email failed');
    }
  };

  const doResend = async () => {
    setSending(true);
    const res = await sendEnvelopeEmail(env.id);
    setSending(false);
    if (res.ok) {
      if (res.attachmentFailures && res.attachmentFailures > 0) {
        pushToast(`Email resent ✓ · ${res.attachmentFailures} attachment(s) were skipped`);
      } else {
        pushToast('Email resent ✓');
      }
      load();
      refreshEnvelopes();
    } else {
      pushToast(res.error || 'Resend failed');
    }
  };

  const doExtend = async () => {
    const e = await adminExtend(env.id, 7);
    setEnv(e);
    refreshEnvelopes();
    pushToast('Expiry extended +7 days');
  };

  const doVoid = async () => {
    if (!confirm('Void this envelope? The access code stops working.')) return;
    const e = await adminVoid(env.id);
    setEnv(e);
    refreshEnvelopes();
    pushToast('Envelope voided');
  };

  const doVerify = async () => {
    setVerify(await verifyEnvelope(env));
  };

  const signLink = env.signingToken ? `${appUrl()}/sign/${env.signingToken}` : '';

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
            {env.expiresAt && (env.status === 'sent' || env.status === 'viewed')
              ? ` · ${expired ? 'expired' : 'valid till'} ${fmt(env.expiresAt)}`
              : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={disp} />
          {canSend && (
            <button className="btn primary sm" disabled={sending} onClick={doSend}>
              {sending ? 'Sending…' : 'Send for signature'}
            </button>
          )}
          {canResend && (
            <button className="btn ghost sm" disabled={sending} onClick={doResend}>
              {sending ? 'Sending…' : 'Resend email ✉'}
            </button>
          )}
          {env.signingToken && (
            <button
              className="btn ghost sm"
              onClick={() => navigator.clipboard.writeText(signLink).then(() => pushToast('Link copied'))}
            >
              Copy signing link
            </button>
          )}
          {env.status === 'sent' || env.status === 'viewed' ? (
            <button
              className="btn ghost sm"
              onClick={() =>
                navigator.clipboard.writeText(env.token).then(() => pushToast('Code copied'))
              }
            >
              Copy access code
            </button>
          ) : null}
          {expired && (
            <button className="btn primary sm" onClick={doExtend}>
              Extend +7 days
            </button>
          )}
          {isDone && (
            <button className="btn primary sm" onClick={() => downloadPDF(env)}>
              Download signed PDF
            </button>
          )}
          {isDone && (
            <button className="btn ghost sm" onClick={doVerify}>
              Verify integrity
            </button>
          )}
          {env.status === 'signed' && isLegacy && (
            <button className="btn primary sm" onClick={() => setCounterOpen(true)}>
              Counter-sign
            </button>
          )}
          {env.status !== 'completed' && env.status !== 'declined' && (
            <button className="btn danger sm" onClick={doVoid}>
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
          {env.recipients.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, marginBottom: 6 }}>
                Recipients
                {totalRecipients > 1 && (
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {' '}
                    · {signedCount} of {totalRecipients} completed
                  </span>
                )}
              </h3>
              {!isDone && totalRecipients > 1 && env.status !== 'declined' && (
                <p className="muted" style={{ marginBottom: 10 }}>
                  {env.signingMode === 'sequential'
                    ? 'Sequential signing — recipients act in order.'
                    : 'Simultaneous signing — all notified at once.'}
                </p>
              )}
              <div>
                {env.recipients
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((r) => {
                    const st = recipientState(r);
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          gap: 10,
                          padding: '9px 0',
                          borderBottom: '1px solid var(--line)',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div style={{ width: 16, color: st.color, fontWeight: 700 }}>{st.icon}</div>
                        <div>
                          <div>
                            <strong>{r.order}. {esc(r.name)}</strong>{' '}
                            <span className="pill draft">{ROLE_LABEL[r.role] || r.role}</span>
                          </div>
                          <div className="muted">{esc(r.email)}</div>
                          <div className="muted" style={{ color: st.color }}>
                            {st.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

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
                  </div>
                </div>
              ))}
              {env.status === 'sent' || env.status === 'viewed' ? (
                <div className="ev">
                  <div className="t" style={{ color: 'var(--warn)' }}>
                    {totalRecipients > 1
                      ? `Awaiting signature: ${env.recipients
                          .sort((a, b) => a.order - b.order)
                          .find((r) => r.status !== 'signed' && r.status !== 'declined')?.name ?? 'next recipient'}`
                      : 'Awaiting recipient signature'}
                  </div>
                </div>
              ) : null}
              {env.status === 'signed' && isLegacy ? (
                <div className="ev">
                  <div className="t" style={{ color: 'var(--warn)' }}>
                    Counter-signature pending — awaiting company signature
                  </div>
                </div>
              ) : null}
              {env.status === 'signed' && !isLegacy && totalRecipients > 1 ? (
                <div className="ev">
                  <div className="t" style={{ color: 'var(--warn)' }}>
                    {signedCount === totalRecipients
                      ? 'All recipients have signed'
                      : `Awaiting signature: ${env.recipients
                          .sort((a, b) => a.order - b.order)
                          .find((r) => r.status !== 'signed' && r.status !== 'declined')?.name ?? 'next recipient'}`}
                  </div>
                </div>
              ) : null}
              {env.status === 'completed' ? (
                <div className="ev">
                  <div className="t" style={{ color: 'var(--ok)' }}>
                    Fully executed
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

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

      <CountersignModal
        env={env}
        open={counterOpen}
        onClose={() => setCounterOpen(false)}
        onDone={() => {
          setCounterOpen(false);
          load();
          refreshEnvelopes();
        }}
      />
    </>
  );
}
