import { useEffect, useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { Steps } from '../components/ui/Steps';
import { Field } from '../components/ui/Field';
import { useDb } from '../lib/useDb';
import { detectMergeFields, mergeBody, esc } from '../lib/utils';
import { createEnvelope } from '../services/envelopes';
import { sendEnvelopeEmail } from '../services/email';
import { pushToast } from '../lib/toast';
import { listTemplates } from '../services/templates';
import { listPeople } from '../services/people';
import type { Envelope } from '../types/envelope';
import type { Template } from '../types/template';
import type { Contact } from '../types/contact';

const STEP_LABELS = ['Template', 'Recipient', 'Fields', 'Preview', 'Review & send'];

function appUrl(): string {
  return (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
}

export function NewEnvelope({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb();
  const [step, setStep] = useState(1);
  const [tpls, setTpls] = useState<Template[]>([]);
  const [people, setPeople] = useState<Contact[]>([]);
  const [tplId, setTplId] = useState('');
  const [personId, setPersonId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [expiryDays, setExpiryDays] = useState(7);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Envelope | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setFields({});
      setExpiryDays(7);
      setSent(null);
      setEmailError(null);
      setFormError(null);
      setSending(false);
      listTemplates()
        .then((t) => {
          setTpls(t);
          setTplId(t[0]?.id ?? '');
        })
        .catch((e) => console.error('Failed to load templates', e));
      listPeople()
        .then((p) => {
          setPeople(p);
          setPersonId(p[0]?.id ?? '');
        })
        .catch((e) => console.error('Failed to load people', e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tpl = tpls.find((t) => t.id === tplId);
  const person = people.find((p) => p.id === personId);
  const mergeFields = tpl ? detectMergeFields(tpl.body) : [];

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
    mergeFields.forEach((f) => {
      if (next[f] === undefined || next[f] === '') next[f] = autoVal(f);
    });
    setFields(next);
  };

  const canSend =
    !!tpl && !!person && !!person.email && mergeFields.every((f) => (fields[f] ?? '').trim() !== '');

  const finish = async (send: boolean) => {
    setFormError(null);

    if (!tplId || !tpl) {
      setFormError('Please select a template.');
      return;
    }
    if (!personId || !person) {
      setFormError('Please select a recipient.');
      return;
    }
    if (!person.email) {
      setFormError('The selected recipient has no email address. Add one in the People tab.');
      return;
    }
    if (mergeFields.some((f) => (fields[f] ?? '').trim() === '')) {
      setFormError('All merge fields must be filled before sending.');
      return;
    }

    setSending(true);
    setEmailError(null);
    try {
      const env = await createEnvelope({ template: tpl, person, fields, expiryDays });
      if (send) {
        const res = await sendEnvelopeEmail(env.id);
        if (!res.ok) {
          setEmailError(
            res.error || 'Envelope saved as draft but the email could not be sent.',
          );
          pushToast('Saved as draft — email failed');
        } else {
          pushToast('Envelope sent ✓');
        }
      } else {
        pushToast('Draft saved');
      }
      setSent(env);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Could not create envelope');
    } finally {
      setSending(false);
    }
  };

  const signLink = sent?.signingToken ? `${appUrl()}/sign/${sent.signingToken}` : '';

  return (
    <Modal open={open} onClose={onClose} maxWidth={680}>
      {sent ? (
        <>
          <h3>Envelope {sent.status === 'sent' ? 'sent ✓' : 'created'}</h3>
          <p style={{ marginBottom: 10 }}>
            {sent.status === 'sent' ? (
              <>
                An email with the signing link was sent to <strong>{esc(sent.signerName)}</strong>{' '}
                <span className="muted">&lt;{esc(sent.signerEmail)}&gt;</span>.
              </>
            ) : (
              <>The envelope is saved as a draft. You can send it later from the envelope detail page.</>
            )}
          </p>

          {sent.status === 'sent' && (
            <>
              <div className="field">
                <label>Signing link</label>
                <div className="link-box">
                  <code>{signLink}</code>
                  <button
                    className="btn ghost sm"
                    onClick={() =>
                      navigator.clipboard.writeText(signLink).then(() => pushToast('Link copied'))
                    }
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Access code (share only with the signer)</label>
                <div className="link-box">
                  <code>{sent.token}</code>
                  <button
                    className="btn ghost sm"
                    onClick={() =>
                      navigator.clipboard.writeText(sent.token).then(() => pushToast('Code copied'))
                    }
                  >
                    Copy
                  </button>
                </div>
              </div>
            </>
          )}

          {emailError && <div className="notice warn">{emailError}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={onClose}>
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
                {tpls.length === 0 ? (
                  <p className="muted">No templates yet — create one in the Templates tab.</p>
                ) : (
                  tpls.map((t) => (
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
                <button className="btn primary" disabled={!tplId} onClick={() => setStep(2)}>
                  Next →
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Recipient (signer)">
                <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.email} ({p.type})
                    </option>
                  ))}
                </select>
              </Field>
              {person && !person.email && (
                <div className="notice warn">
                  This person has no email address. Add one in the People tab before sending.
                </div>
              )}
              <p className="muted">
                The signer email is taken from the selected person. They will receive the signing link
                by email.
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
                where possible — review and edit each value.
              </p>
              <div className="grid g2">
                {mergeFields.map((f) => (
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
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button className="btn ghost" onClick={() => setStep(3)}>
                  ← Back
                </button>
                <button className="btn primary" onClick={() => setStep(5)}>
                  Review →
                </button>
              </div>
            </>
          )}

          {step === 5 && tpl && person && (
            <>
              <div className="field">
                <label>Signer email</label>
                <input value={person.email} disabled />
              </div>
              <div className="field">
                <label>Signing link valid for</label>
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
              </div>
              <p className="muted" style={{ margin: '12px 0' }}>
                On send: a SHA-256 fingerprint of the merged document is sealed, a secure signing link
                and a one-time access code are generated, and the signer is emailed a secure link.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button className="btn ghost" onClick={() => setStep(4)}>
                  ← Back
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn ghost" disabled={sending} onClick={() => finish(false)}>
                    Save as draft
                  </button>
                  <button
                    className="btn primary"
                    disabled={!canSend || sending}
                    onClick={() => finish(true)}
                  >
                    {sending ? 'Sending…' : 'Send for signature'}
                  </button>
                </div>
              </div>
              {!canSend && (
                <p className="muted" style={{ marginTop: 8 }}>
                  {!person.email
                    ? 'A signer email is required.'
                    : 'All detected merge fields must be filled before sending.'}
                </p>
              )}
              {formError && <div className="notice warn" style={{ marginTop: 8 }}>{formError}</div>}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
