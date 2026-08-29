import { useEffect, useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { Steps } from '../components/ui/Steps';
import { Field } from '../components/ui/Field';
import { useDb } from '../lib/useDb';
import { detectMergeFields, mergeBody, esc } from '../lib/utils';
import { createEnvelope } from '../services/envelopes';
import { openSendMail } from '../lib/mail';
import { pushToast } from '../lib/toast';
import type { Envelope } from '../types/envelope';

const STEP_LABELS = ['Template', 'Recipient', 'Details', 'Review & send'];

export function NewEnvelope({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb();
  const [step, setStep] = useState(1);
  const [tplId, setTplId] = useState('');
  const [personId, setPersonId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [expiryDays, setExpiryDays] = useState(7);
  const [sent, setSent] = useState<Envelope | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setTplId(db.templates[0]?.id ?? '');
      setPersonId(db.people[0]?.id ?? '');
      setFields({});
      setExpiryDays(7);
      setSent(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tpl = db.templates.find((t) => t.id === tplId);
  const person = db.people.find((p) => p.id === personId);

  const autoVal = (f: string): string => {
    if (!person) return '';
    const today = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const map: Record<string, string> = {
      name: person.name,
      email: person.email,
      designation: person.designation,
      address: person.address,
      vendor_entity: person.designation,
      company: db.settings.company,
      company_address: db.settings.address,
      work_location: db.settings.address,
      issue_date: today,
      reporting_to: db.settings.signerName,
    };
    return map[f] ?? '';
  };

  const prepFields = () => {
    if (!tpl) return;
    const next: Record<string, string> = { ...fields };
    detectMergeFields(tpl.body).forEach((f) => {
      if (next[f] === undefined || next[f] === '') next[f] = autoVal(f);
    });
    setFields(next);
  };

  const finish = async (send: boolean) => {
    if (!tpl || !person) return;
    const env = await createEnvelope({
      templateId: tpl.id,
      personId: person.id,
      fields,
      expiryDays,
      send,
    });
    if (send) {
      setSent(env);
    } else {
      pushToast('Draft saved');
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={640}>
      {sent ? (
        <>
          <h3>Envelope sent ✓</h3>
          <p style={{ marginBottom: 10 }}>
            Share this access code with <strong>{esc(sent.signerName)}</strong>. They enter it in the{' '}
            <strong>Signer portal</strong> to review and sign.
          </p>
          <div className="link-box">
            <code>{sent.token}</code>
            <button
              className="btn ghost sm"
              onClick={() => navigator.clipboard.writeText(sent.token).then(() => pushToast('Code copied'))}
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
                openSendMail(sent, db.settings);
              }}
            >
              Open email draft
            </a>
            <button
              className="btn primary"
              onClick={() => {
                onClose();
              }}
            >
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <h3>New envelope</h3>
          <Steps current={step} labels={STEP_LABELS} />

          {step === 1 && (
            <>
              <Field label="Choose a template">
                {db.templates.length === 0 ? (
                  <p className="muted">No templates yet — create one in the Templates tab.</p>
                ) : (
                  db.templates.map((t) => (
                    <label
                      key={t.id}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        fontWeight: 500,
                        padding: 10,
                        border: `1px solid ${tplId === t.id ? 'var(--cobalt)' : 'var(--line)'}`,
                        borderRadius: 8,
                        marginBottom: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="tpl"
                        style={{ width: 'auto' }}
                        checked={tplId === t.id}
                        onChange={() => setTplId(t.id)}
                      />
                      <span>
                        <strong>{esc(t.name)}</strong>{' '}
                        <span className={`pill ${t.kind === 'vendor' ? 'sent' : 'completed'}`}>
                          {t.kind}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn ghost" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="btn primary"
                  disabled={!tplId}
                  onClick={() => setStep(2)}
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Recipient (signs first)">
                <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                  {db.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.email} ({p.type})
                    </option>
                  ))}
                </select>
              </Field>
              <p className="muted">
                Signing order: <strong>1)</strong> recipient signs → <strong>2)</strong>{' '}
                {esc(db.settings.signerName)} countersigns → completed &amp; PDF issued.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <button className="btn ghost" onClick={() => setStep(1)}>
                  ← Back
                </button>
                <button
                  className="btn primary"
                  disabled={!personId}
                  onClick={() => {
                    prepFields();
                    setStep(3);
                  }}
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {step === 3 && tpl && (
            <>
              <p className="muted" style={{ marginBottom: 12 }}>
                Merge fields detected in the template. Pre-filled from the person record and settings
                where possible.
              </p>
              <div className="grid g2">
                {detectMergeFields(tpl.body).map((f) => (
                  <div className="field" key={f}>
                    <label>{f.replace(/_/g, ' ')}</label>
                    <input
                      value={fields[f] ?? ''}
                      onChange={(e) => setFields((prev) => ({ ...prev, [f]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button className="btn ghost" onClick={() => setStep(2)}>
                  ← Back
                </button>
                <button className="btn primary" onClick={() => setStep(4)}>
                  Preview →
                </button>
              </div>
            </>
          )}

          {step === 4 && tpl && person && (
            <>
              {(() => {
                const body = mergeBody(tpl.body, fields);
                const lh = tpl.letterhead || db.settings.letterhead;
                const prevHeader = lh ? (
                  <div className="lh-img">
                    <img src={lh} alt="letterhead" />
                  </div>
                ) : (
                  <div className="lh">
                    {esc(db.settings.company).toUpperCase()}
                    <small>{esc(db.settings.address)}</small>
                  </div>
                );
                return (
                  <div
                    className="doc-paper"
                    style={{ maxHeight: 340, overflowY: 'auto', padding: '28px 32px', fontSize: 12.5 }}
                  >
                    {prevHeader}
                    {esc(body)}
                  </div>
                );
              })()}
              <Field label="Signing link valid for">
                <select
                  style={{ maxWidth: 260 }}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value))}
                >
                  <option value={3}>3 days</option>
                  <option value={7}>7 days (recommended)</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                </select>
              </Field>
              <p className="muted" style={{ margin: '12px 0' }}>
                On send: a SHA-256 fingerprint of this exact text is sealed into the audit trail, and a
                unique access code is generated for {esc(person.name)}.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button className="btn ghost" onClick={() => setStep(3)}>
                  ← Back
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn ghost" onClick={() => finish(false)}>
                    Save as draft
                  </button>
                  <button className="btn primary" onClick={() => finish(true)}>
                    Send for signature
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
