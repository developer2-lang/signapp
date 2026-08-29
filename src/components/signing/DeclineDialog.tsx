import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Field } from '../ui/Field';

export function DeclineDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  const submit = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason('');
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h3>Decline to sign</h3>
      <p className="muted" style={{ marginBottom: 12 }}>
        Your reason will be recorded in the envelope's audit trail and shared with the company.
        Declining is permanent for this envelope — a revised document would be sent as a new envelope.
      </p>
      <Field label="Reason for declining (required)">
        <textarea
          rows={4}
          placeholder="e.g. The notice period in clause 2 differs from what was discussed…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn ghost" onClick={onClose}>
          Go back
        </button>
        <button className="btn danger" onClick={submit}>
          Confirm decline
        </button>
      </div>
    </Modal>
  );
}
