import { useEffect, useRef, useState } from 'react';
import { useDb } from '../lib/useDb';
import { Modal } from '../components/ui/Modal';
import { Field } from '../components/ui/Field';
import { compressImage } from '../lib/utils';
import { pushToast } from '../lib/toast';
import { saveSettings, setPin, changePin, removePin } from '../services/settings';
import { loadDemoData } from '../lib/demo';
import { exportData, importData, wipeData } from '../services/contacts';

export function Settings() {
  const db = useDb();
  const s = db.settings;
  const [signerName, setSignerName] = useState(s.signerName);
  const [signerTitle, setSignerTitle] = useState(s.signerTitle);
  const [company, setCompany] = useState(s.company);
  const [address, setAddress] = useState(s.address);
  const [pinSetupMode, setPinSetupMode] = useState<null | 'change' | 'remove'>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSignerName(s.signerName);
    setSignerTitle(s.signerTitle);
    setCompany(s.company);
    setAddress(s.address);
  }, [s.signerName, s.signerTitle, s.company, s.address]);

  const save = () => {
    saveSettings({
      signerName: signerName.trim(),
      signerTitle: signerTitle.trim(),
      company: company.trim(),
      address: address.trim(),
    });
    pushToast('Settings saved');
  };

  const onLetterhead = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const d = await compressImage(f, 1600, 0.85);
      saveSettings({ letterhead: d });
      pushToast('Company letterhead saved');
    } catch {
      pushToast('Could not read image — use PNG or JPG');
    }
    ev.target.value = '';
  };

  const enablePin = async (pin: string) => {
    if (!/^\d{4,6}$/.test(pin)) {
      pushToast('PIN must be 4–6 digits');
      return;
    }
    await setPin(pin);
    pushToast('PIN enabled — admin locks on next reload');
  };

  const applyPin = async (cur: string, next?: string) => {
    if (pinSetupMode === 'change') {
      const ok = await changePin(cur, next || '');
      if (!ok) {
        pushToast('Current PIN is incorrect');
        return;
      }
      pushToast('PIN changed');
    } else {
      const ok = await removePin(cur);
      if (!ok) {
        pushToast('Current PIN is incorrect');
        return;
      }
      pushToast('PIN removed');
    }
    setPinSetupMode(null);
  };

  return (
    <>
    <div className="settings-page">
      <div className="card settings-card">
        <h3 className="settings-card-title">Company signatory</h3>
        <Field label="Countersigning authority (name)">
          <input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
        </Field>
        <Field label="Designation">
          <input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
        </Field>
        <Field label="Company legal name">
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="Registered address (appears on letterhead)">
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Company letterhead (PNG/JPG banner) — default for all letters">
          {s.letterhead ? (
            <div className="up-preview">
              <img src={s.letterhead} alt="company letterhead" />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn ghost sm" onClick={() => document.getElementById('setLhFile')?.click()}>
                  Replace
                </button>
                <button
                  className="btn danger sm"
                  onClick={() => {
                    saveSettings({ letterhead: null });
                    pushToast('Letterhead removed');
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button className="btn ghost sm" onClick={() => document.getElementById('setLhFile')?.click()}>
              Upload letterhead image
            </button>
          )}
          <input
            type="file"
            id="setLhFile"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onLetterhead}
          />
          <p className="muted" style={{ marginTop: 6 }}>
            A wide banner (your printed letterhead top strip, ~1600×250 px) works best. Individual
            templates can override this.
          </p>
        </Field>
        <button className="btn primary" onClick={save}>
          Save settings
        </button>
      </div>

      <div className="card settings-card">
        <h3 className="settings-card-title">Security</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          A PIN gates the Admin portal — protecting salary figures, NDAs and signatures from anyone who
          opens the app. The Signer portal remains accessible without it. Honest caveat: this deters
          casual access on a shared device; it is not encryption.
        </p>
        {s.pinHash ? (
          <div>
            <p style={{ marginBottom: 10 }}>
              🔒 <strong>PIN is enabled.</strong> The Admin portal locks on every reload.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn ghost sm" onClick={() => setPinSetupMode('change')}>
                Change PIN
              </button>
              <button className="btn danger sm" onClick={() => setPinSetupMode('remove')}>
                Remove PIN
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 180 }}>
              <label>Set a 4–6 digit PIN</label>
              <input
                id="newPin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoComplete="off"
              />
            </div>
            <button
              className="btn primary sm"
              onClick={() => {
                const v = (document.getElementById('newPin') as HTMLInputElement).value;
                enablePin(v);
                (document.getElementById('newPin') as HTMLInputElement).value = '';
              }}
            >
              Enable PIN lock
            </button>
          </div>
        )}
      </div>

      <div className="card settings-card">
        <h3 className="settings-card-title">Data</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          Everything is stored in this app's persistent storage. Export a JSON backup regularly.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn ghost"
            onClick={() => {
              if (
                confirm(
                  'Add demo data? This adds 5 sample people and 8 envelopes covering every state. Existing records are kept. Demo emails use @example.com so they are easy to spot and delete.',
                )
              ) {
                loadDemoData().then(() => pushToast('Demo data loaded'));
              }
            }}
          >
            Load demo data
          </button>
          <button className="btn ghost" onClick={exportData}>
            Export backup (JSON)
          </button>
          <button className="btn ghost" onClick={() => fileInputRef.current?.click()}>
            Import backup
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept=".json"
            className="hidden"
            onChange={async (ev) => {
              const f = ev.target.files?.[0];
              if (!f) return;
              try {
                await importData(f);
                pushToast('Backup restored');
              } catch {
                pushToast('Invalid backup file');
              }
              ev.target.value = '';
            }}
          />
          <button
            className="btn danger"
            onClick={() => {
              if (
                confirm(
                  'Erase ALL envelopes, templates, people and settings? This cannot be undone.',
                )
              ) {
                wipeData();
                pushToast('All data erased');
              }
            }}
          >
            Erase all data
          </button>
        </div>
      </div>

      </div>

      <Modal open={pinSetupMode !== null} onClose={() => setPinSetupMode(null)}>
        <h3>{pinSetupMode === 'change' ? 'Change PIN' : 'Remove PIN'}</h3>
        <PinSetupForm mode={pinSetupMode} onCancel={() => setPinSetupMode(null)} onApply={applyPin} />
      </Modal>
    </>
  );
}

function PinSetupForm({
  mode,
  onCancel,
  onApply,
}: {
  mode: 'change' | 'remove' | null;
  onCancel: () => void;
  onApply: (cur: string, next?: string) => void;
}) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  return (
    <>
      <Field label="Current PIN">
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoComplete="off"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
        />
      </Field>
      {mode === 'change' && (
        <Field label="New PIN (4–6 digits)">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => onApply(cur, next)}>
          {mode === 'change' ? 'Change' : 'Remove'}
        </button>
      </div>
    </>
  );
}
