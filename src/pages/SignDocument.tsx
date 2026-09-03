import { useEffect, useRef, useState } from 'react';
import { useDb } from '../lib/useDb';
import {
  getEnvelopeMeta,
  unlockEnvelope,
  signEnvelope,
  declineEnvelope,
  notifyNextRecipient,
  sendCompletionAfterSign,
  type SignerMeta,
} from '../services/signers';
import { finalizeSignature } from '../services/signatures';
import { fmt, esc } from '../lib/utils';
import { pushToast } from '../lib/toast';
import { downloadPDF } from '../lib/pdf';
import { AccessCodeScreen } from '../components/signing/AccessCodeScreen';
import { ConsentSection } from '../components/signing/ConsentSection';
import { DocumentViewer } from '../components/signing/DocumentViewer';
import { SignatureCapture, type SignatureCaptureHandle } from '../components/signing/SignatureCapture';
import { DeclineDialog } from '../components/signing/DeclineDialog';
import type { Envelope } from '../types/envelope';

type Stage = 'entry' | 'code' | 'doc' | 'pad' | 'done';

function extractToken(v: string): string {
  const t = v.trim();
  const m = t.match(/\/sign\/([A-Za-z0-9]+)/i);
  return m ? m[1] : t;
}

export function SignerPortal({
  token,
  onToken,
  onHome,
}: {
  token?: string;
  onToken?: (t: string) => void;
  onHome?: () => void;
}) {
  const db = useDb();
  const [stage, setStage] = useState<Stage>(token ? 'code' : 'entry');
  const [meta, setMeta] = useState<SignerMeta | null>(null);
  const [env, setEnv] = useState<Envelope | null>(null);
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const sigRef = useRef<SignatureCaptureHandle>(null);

  useEffect(() => {
    if (token) {
      setStage('code');
      getEnvelopeMeta(token)
        .then((m) => {
          if (!m) {
            pushToast('Signing link is invalid or expired');
            return;
          }
          setMeta(m);
          if (m.alreadySigned || m.status === 'completed') {
            // open directly once the (correct) code is supplied; pre-fill nothing
          }
        })
        .catch((e) => {
          console.error('[SignDocument] getEnvelopeMeta failed', e);
          pushToast(e instanceof Error ? e.message : 'Could not load document');
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const reset = () => {
    setStage(token ? 'code' : 'entry');
    setEnv(null);
    setConsent(false);
    setCode('');
  };

  const submitLink = (v: string) => {
    const t = extractToken(v);
    if (!t) return;
    onToken?.(t);
  };

  const submitCode = async (v: string) => {
    if (!token) return;
    const c = v.trim();
    try {
      const e = await unlockEnvelope(token, c);
      setCode(c);
      setEnv(e);
      if (e.status === 'completed' || e.status === 'declined') {
        setStage('done');
      } else {
        const self = e.recipients.find((r) => r.id === e.signerId);
        if (self?.status === 'signed') {
          setStage('done');
        } else {
          setStage('doc');
        }
      }
    } catch (err) {
      console.error('[SignDocument] unlockEnvelope failed', err);
      pushToast(err instanceof Error ? err.message : 'Could not open document');
    }
  };

  const proceedToSign = () => {
    if (!env) return;
    setStage('pad');
  };

  const onSign = async () => {
    if (!env || !token) return;
    const input = sigRef.current?.getInput();
    if (!input) {
      pushToast('Please provide a signature');
      return;
    }
    try {
      const sig = await finalizeSignature(input, env.docHash);
      const updated = await signEnvelope(token, code, sig);
      setEnv(updated);
      setStage('done');
      setConsent(false);
      // When the envelope just completed, email the final signed PDF to all
      // completed recipients. Otherwise (sequential mode) notify the next
      // active recipient automatically.
      if (updated.status === 'completed') {
        sendCompletionAfterSign(updated).catch((err) => {
          console.error('[SignDocument] completion email failed', err);
        });
      } else {
        notifyNextRecipient(updated).catch((err) => {
          console.error('[SignDocument] notify next recipient failed', err);
        });
      }
      const verb = updated.role === 'countersigner' ? 'Countersigned' : 'Document signed';
      pushToast(`${verb} ✓`);
    } catch (err) {
      console.error('[SignDocument] signEnvelope failed', err);
      pushToast(err instanceof Error ? err.message : 'Could not sign document');
    }
  };

  const onDecline = async (reason: string) => {
    if (!token) return;
    try {
      const updated = await declineEnvelope(token, code || (meta ? '' : ''), reason);
      setEnv(updated);
      setDeclineOpen(false);
      setStage('done');
    } catch (err) {
      console.error('[SignDocument] declineEnvelope failed', err);
      pushToast(err instanceof Error ? err.message : 'Could not decline document');
    }
  };

  return (
    <div className="sign-shell" id="signerShell">
      {(stage === 'entry') && (
        <AccessCodeScreen
          onSubmit={submitLink}
        />
      )}

      {(stage === 'code') && (
        <div>
          {meta && (
            <div className="card" style={{ maxWidth: 460, margin: '40px auto 12px', textAlign: 'center', padding: 18 }}>
              <h2 style={{ fontSize: 18, marginBottom: 4 }}>{esc(meta.title)}</h2>
              <p className="muted">
                For {esc(meta.signerName)}
                {meta.role === 'countersigner' ? ' · Countersignature required' : ' · Signature required'}
                {meta.expiresAt ? ` · valid till ${fmt(meta.expiresAt)}` : ''}
              </p>
              {meta.alreadySigned && (
                <div className="notice" style={{ textAlign: 'left' }}>
                  You have already signed this step.
                </div>
              )}
              {meta.signingMode === 'sequential' && !meta.alreadySigned && !meta.isActive && (
                <div className="notice" style={{ textAlign: 'left' }}>
                  It is not your turn yet — an earlier recipient must sign first.
                </div>
              )}
            </div>
          )}
          <AccessCodeScreen onSubmit={submitCode} />
        </div>
      )}

      {stage === 'doc' && env && (
        <>
          <div style={{ margin: '6px 0 16px' }}>
            <h2 style={{ fontSize: 19 }}>{env.title}</h2>
            <p className="muted">
              From {db.settings.company} ·{' '}
              {env.role === 'countersigner'
                ? 'you are asked to countersign this document'
                : 'review carefully before signing'}
              {env.signingMode === 'sequential' && env.recipients.length > 1
                ? ` · Signing order: ${(env.recipients.findIndex((r) => r.id === env.signerId) ?? 0) + 1} of ${env.recipients.length}`
                : ''}
            </p>
          </div>
          <DocumentViewer env={env} />
          <ConsentSection name={env.signerName} checked={consent} onChange={setConsent} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn ghost" onClick={reset}>
              Cancel
            </button>
            <button className="btn danger" onClick={() => setDeclineOpen(true)}>
              Decline to sign
            </button>
            <button className="btn primary" id="goSign" disabled={!consent} onClick={proceedToSign}>
              Proceed to sign →
            </button>
          </div>
          <DeclineDialog open={declineOpen} onClose={() => setDeclineOpen(false)} onConfirm={onDecline} />
        </>
      )}

      {stage === 'pad' && env && (
        <div className="card" style={{ maxWidth: 560, margin: '20px auto' }}>
          <h3 style={{ marginBottom: 4 }}>
            {env.role === 'countersigner' ? 'Adopt your countersignature' : 'Adopt your signature'}
          </h3>
          <p className="muted" style={{ marginBottom: 14 }}>
            Draw with mouse/finger, or type your name.
          </p>
          <SignatureCapture ref={sigRef} defaultName={env.signerName} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button className="btn ghost" onClick={() => setStage('doc')}>
              ← Back
            </button>
            <button className="btn primary" onClick={onSign}>
              {env.role === 'countersigner' ? 'Countersign document' : 'Sign document'}
            </button>
          </div>
        </div>
      )}

      {stage === 'done' && env && (
        <div className="card" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center', padding: 36 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>
            {env.status === 'completed' ? '✅' : env.status === 'declined' ? '🚫' : '✍️'}
          </div>
          <h2 style={{ fontSize: 19, marginBottom: 8 }}>
            {env.status === 'completed'
              ? 'Fully executed'
              : env.status === 'declined'
                ? 'Declined'
                : env.role === 'countersigner'
                  ? `Countersigned — thank you, ${env.signerName}`
                  : `Signed — thank you, ${env.signerName}`}
          </h2>
          <p className="muted" style={{ marginBottom: 18 }}>
            {env.status === 'completed'
              ? env.recipients.length > 1
                ? 'All parties have signed. You can download your copy below.'
                : 'Both parties have signed. You can download your copy below.'
              : env.status === 'declined'
                ? 'Your reason has been recorded. If the document is revised, you will receive a fresh signing request.'
                : env.recipients.some((r) => r.status === 'active')
                  ? 'Your signature has been recorded and hash-sealed. The next recipient will be notified automatically.'
                  : 'Your signature has been recorded and hash-sealed.'}
          </p>
          {env.status === 'completed' && (
            <button className="btn primary" onClick={() => downloadPDF(env)}>
              Download signed PDF
            </button>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {onHome && (
              <button className="btn ghost sm" onClick={onHome}>
                Back to app
              </button>
            )}
            <button className="btn ghost sm" onClick={reset}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
