import { useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { SignatureCapture, type SignatureCaptureHandle } from './SignatureCapture';
import { useDb } from '../../lib/useDb';
import { finalizeSignature } from '../../services/signatures';
import { adminCountersign } from '../../services/envelopes';
import { pushToast } from '../../lib/toast';
import type { Envelope } from '../../types/envelope';

/**
 * Admin/company counter-signature. This is the ONLY action that completes an
 * envelope: the client has already signed (status 'signed'), and applying the
 * company signature here moves it to 'completed' and stores the countersignature.
 */
export function CountersignModal({
  env,
  open,
  onClose,
  onDone,
}: {
  env: Envelope;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const db = useDb();
  const ref = useRef<SignatureCaptureHandle>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    const input = ref.current?.getInput();
    if (!input) {
      pushToast('Please provide a signature');
      return;
    }
    setBusy(true);
    try {
      const sig = await finalizeSignature(input, env.docHash);
      await adminCountersign(env.id, sig);
      pushToast('Counter-signed — envelope completed ✓');
      onDone();
    } catch (err) {
      console.error('[CountersignModal] adminCountersign failed', err);
      pushToast(err instanceof Error ? err.message : 'Could not counter-sign');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h3>Countersign — {env.title}</h3>
      <p className="muted" style={{ marginBottom: 12 }}>
        Signing as <strong>{db.settings.signerName}</strong>, {db.settings.signerTitle}.
      </p>
      <SignatureCapture ref={ref} defaultName={db.settings.signerName} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={confirm} disabled={busy}>
          {busy ? 'Counter-signing…' : 'Countersign & complete'}
        </button>
      </div>
    </Modal>
  );
}
