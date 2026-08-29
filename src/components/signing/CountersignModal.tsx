import { useRef } from 'react';
import { Modal } from '../ui/Modal';
import { SignatureCapture, type SignatureCaptureHandle } from './SignatureCapture';
import { useDb } from '../../lib/useDb';
import { countersignEnvelope } from '../../services/envelopes';
import { pushToast } from '../../lib/toast';
import type { Envelope } from '../../types/envelope';

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

  const confirm = async () => {
    const input = ref.current?.getInput();
    if (!input) {
      pushToast('Please provide a signature');
      return;
    }
    await countersignEnvelope(env.id, input);
    onDone();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h3>Countersign — {env.title}</h3>
      <p className="muted" style={{ marginBottom: 12 }}>
        Signing as <strong>{db.settings.signerName}</strong>, {db.settings.signerTitle}. This
        completes the envelope.
      </p>
      <SignatureCapture ref={ref} defaultName={db.settings.signerName} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={confirm}>
          Countersign &amp; complete
        </button>
      </div>
    </Modal>
  );
}
