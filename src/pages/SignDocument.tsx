import { useRef, useState } from 'react';
import { useDb } from '../lib/useDb';
import { getEnvelope, recordSignerViewed, recordSignerConsent, signEnvelope, declineEnvelope } from '../services/envelopes';
import { isExpired } from '../lib/utils';
import { pushToast } from '../lib/toast';
import { downloadPDF } from '../lib/pdf';
import { AccessCodeScreen } from '../components/signing/AccessCodeScreen';
import { ConsentSection } from '../components/signing/ConsentSection';
import { DocumentViewer } from '../components/signing/DocumentViewer';
import { SignatureCapture, type SignatureCaptureHandle } from '../components/signing/SignatureCapture';
import { DeclineDialog } from '../components/signing/DeclineDialog';
import type { Envelope } from '../types/envelope';

type Stage = 'entry' | 'doc' | 'pad' | 'done';

export function SignerPortal() {
  const db = useDb();
  const [stage, setStage] = useState<Stage>('entry');
  const [env, setEnv] = useState<Envelope | null>(null);
  const [consent, setConsent] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const sigRef = useRef<SignatureCaptureHandle>(null);

  const reset = () => {
    setStage('entry');
    setEnv(null);
    setConsent(false);
  };

  const enterCode = (code: string) => {
    const c = code.trim().toUpperCase();
    const e = db.envelopes.find((x) => x.token === c);
    if (!e) {
      pushToast('No document found for that code');
      return;
    }
    if (e.status === 'declined') {
      pushToast('This envelope has been voided or declined');
      return;
    }
    if (isExpired(e)) {
      pushToast('This access code has expired — please ask the sender to extend it');
      return;
    }
    if (e.status === 'completed' || e.status === 'signed') {
      setEnv(e);
      setStage('done');
      return;
    }
    if (e.status !== 'sent') {
      pushToast('This document has not been sent yet');
      return;
    }
    recordSignerViewed(e.id);
    setEnv(e);
    setStage('doc');
  };

  const proceedToSign = () => {
    if (!env) return;
    recordSignerConsent(env.id);
    setStage('pad');
  };

  const onSign = async () => {
    if (!env) return;
    const input = sigRef.current?.getInput();
    if (!input) {
      pushToast('Please provide a signature');
      return;
    }
    await signEnvelope(env.id, input);
    setEnv(getEnvelope(env.id) ?? null);
    setStage('done');
    setConsent(false);
  };

  const onDecline = (reason: string) => {
    if (!env) return;
    declineEnvelope(env.id, reason);
    setEnv(getEnvelope(env.id) ?? null);
    setDeclineOpen(false);
    setStage('done');
  };

  return (
    <div className="sign-shell" id="signerShell">
      {stage === 'entry' && <AccessCodeScreen onSubmit={enterCode} />}

      {stage === 'doc' && env && (
        <>
          <div style={{ margin: '6px 0 16px' }}>
            <h2 style={{ fontSize: 19 }}>{env.title}</h2>
            <p className="muted">From {db.settings.company} · review carefully before signing</p>
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
          <h3 style={{ marginBottom: 4 }}>Adopt your signature</h3>
          <p className="muted" style={{ marginBottom: 14 }}>
            Draw with mouse/finger, or type your name.
          </p>
          <SignatureCapture ref={sigRef} defaultName={env.signerName} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button className="btn ghost" onClick={() => setStage('doc')}>
              ← Back
            </button>
            <button className="btn primary" onClick={onSign}>
              Sign document
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
                : `Signed — thank you, ${env.signerName}`}
          </h2>
          <p className="muted" style={{ marginBottom: 18 }}>
            {env.status === 'completed'
              ? 'Both parties have signed. You can download your copy below.'
              : env.status === 'declined'
                ? 'Your reason has been recorded and the company has been notified. If the document is revised, you will receive a fresh signing request.'
                : 'Your signature has been recorded and hash-sealed. The countersignatory will now countersign; you will receive the final PDF by email once complete.'}
          </p>
          {env.status === 'completed' && (
            <button className="btn primary" onClick={() => downloadPDF(env.id)}>
              Download signed PDF
            </button>
          )}
          <div style={{ marginTop: 16 }}>
            <button className="btn ghost sm" onClick={reset}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
