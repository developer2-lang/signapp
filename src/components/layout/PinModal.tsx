import { useEffect, useState } from 'react';
import { verifyPin } from '../../services/settings';
import { pushToast } from '../../lib/toast';

export function PinModal({
  onUnlock,
  onGoSigner,
}: {
  onUnlock: () => void;
  onGoSigner: () => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const t = setTimeout(() => document.getElementById('pinInput')?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const tryUnlock = async () => {
    if (await verifyPin(value.trim())) {
      setValue('');
      onUnlock();
    } else {
      pushToast('Wrong PIN');
      setValue('');
    }
  };

  return (
    <div className="modal-bg" id="pinModal">
      <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }}>
        <h3 style={{ marginBottom: 6 }}>Admin locked</h3>
        <p className="muted" style={{ marginBottom: 16 }}>
          Enter the admin PIN to access envelopes, people and settings. The Signer portal stays open
          without a PIN.
        </p>
        <div className="pin-dots">
          <input
            id="pinInput"
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
          />
        </div>
        <button
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
          onClick={tryUnlock}
        >
          Unlock
        </button>
        <button
          className="btn ghost sm"
          style={{ marginTop: 10 }}
          onClick={() => {
            setValue('');
            onGoSigner();
          }}
        >
          Go to Signer portal instead
        </button>
      </div>
    </div>
  );
}
