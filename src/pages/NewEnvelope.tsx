import { useEffect, useState, useRef } from 'react';
import { Modal } from '../components/ui/Modal';
import { Steps } from '../components/ui/Steps';
import { Field } from '../components/ui/Field';
import { useDb } from '../lib/useDb';
import { detectMergeFields, mergeBody, esc } from '../lib/utils';
import { createEnvelope, type EnvelopeRecipientInput } from '../services/envelopes';
import { sendEnvelopeEmail } from '../services/email';
import { pushToast } from '../lib/toast';
import { listTemplates } from '../services/templates';
import { listPeople } from '../services/people';
import {
  validateAttachmentFile,
  uploadAttachments,
  formatSize,
} from '../services/attachments';
import type { Envelope, RecipientRole } from '../types/envelope';
import type { Template } from '../types/template';
import type { Contact } from '../types/contact';

const STEP_LABELS = ['Template', 'Recipients', 'Fields', 'Preview', 'Review & send'];

function appUrl(): string {
  return (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
}

interface RecipientDraft {
  key: string;
  personId: string | null;
  name: string;
  email: string;
  role: RecipientRole;
}

let draftKey = 0;
const nextKey = (): string => `r_${Date.now().toString(36)}_${(draftKey++).toString(36)}`;

const ROLE_LABEL: Record<RecipientRole, string> = {
  signer: 'Signer',
  countersigner: 'Countersigner',
};

export function NewEnvelope({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb();
  const [step, setStep] = useState(1);
  const [tpls, setTpls] = useState<Template[]>([]);
  const [people, setPeople] = useState<Contact[]>([]);
  const [tplId, setTplId] = useState('');
  const [recipients, setRecipients] = useState<RecipientDraft[]>([]);
  const [signingMode, setSigningMode] = useState<'sequential' | 'simultaneous'>('sequential');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [expiryDays, setExpiryDays] = useState(7);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Envelope | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setFields({});
      setExpiryDays(7);
      setSent(null);
      setEmailError(null);
      setFormError(null);
      setSending(false);
      setRecipients([]);
      setSigningMode('sequential');
      setAttachments([]);
      setAttachmentError(null);
      listTemplates()
        .then((t) => {
          setTpls(t);
          setTplId(t[0]?.id ?? '');
        })
        .catch((e) => console.error('Failed to load templates', e));
      listPeople()
        .then((p) => setPeople(p))
        .catch((e) => console.error('Failed to load people', e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tpl = tpls.find((t) => t.id === tplId);
  const primary = recipients[0] ?? null;
  const primaryPerson = primary?.personId
    ? people.find((p) => p.id === primary.personId)
    : null;
  const mergeFields = tpl ? detectMergeFields(tpl.body) : [];

  const autoVal = (f: string): string => {
    const person = primaryPerson;
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
    !!tpl &&
    recipients.length > 0 &&
    recipients.every((r) => r.name.trim() !== '' && r.email.trim() !== '') &&
    mergeFields.every((f) => (fields[f] ?? '').trim() !== '');

  const addRecipient = (person?: Contact) => {
    if (person) {
      setRecipients((prev) => [
        ...prev,
        { key: nextKey(), personId: person.id, name: person.name, email: person.email, role: 'signer' },
      ]);
    } else {
      setRecipients((prev) => [
        ...prev,
        { key: nextKey(), personId: null, name: '', email: '', role: 'signer' },
      ]);
    }
  };

  const updateRecipient = (key: string, patch: Partial<RecipientDraft>) => {
    setRecipients((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRecipient = (key: string) => {
    setRecipients((prev) => prev.filter((r) => r.key !== key));
  };

  const moveRecipient = (index: number, dir: -1 | 1) => {
    setRecipients((prev) => {
      const next = prev.slice();
      const to = index + dir;
      if (to < 0 || to >= next.length) return prev;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  };

  const personFor = (r: RecipientDraft): Contact | undefined =>
    r.personId ? people.find((p) => p.id === r.personId) : undefined;

  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setAttachmentError(null);
    const newFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        validateAttachmentFile(file);
        newFiles.push(file);
      } catch (err) {
        setAttachmentError(err instanceof Error ? err.message : 'Invalid file');
      }
    }
    if (newFiles.length > 0) {
      setAttachments((prev) => [...prev, ...newFiles]);
    }
    // Reset the input so the same file can be re-selected if removed.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const finish = async (send: boolean) => {
    setFormError(null);

    if (!tplId || !tpl) {
      setFormError('Please select a template.');
      return;
    }
    if (recipients.length === 0) {
      setFormError('Add at least one recipient.');
      return;
    }
    const seen = new Set<string>();
    for (const r of recipients) {
      const email = r.email.trim().toLowerCase();
      if (!email) {
        setFormError(`Recipient "${r.name || '?'}" is missing an email address.`);
        return;
      }
      if (seen.has(email)) {
        setFormError(`Duplicate recipient "${r.name}" (${r.email}) — each recipient must be unique.`);
        return;
      }
      seen.add(email);
    }
    if (!signingMode) {
      setFormError('Choose a signing mode.');
      return;
    }
    if (mergeFields.some((f) => (fields[f] ?? '').trim() === '')) {
      setFormError('All merge fields must be filled before sending.');
      return;
    }

    const payload: EnvelopeRecipientInput[] = recipients.map((r, i) => ({
      personId: r.personId,
      name: r.name.trim(),
      email: r.email.trim(),
      role: r.role,
      order: i + 1,
    }));

    setSending(true);
    setEmailError(null);
    try {
      const env = await createEnvelope({
        template: tpl,
        recipients: payload,
        signingMode,
        fields,
        expiryDays,
      });

      // Upload any envelope attachments ONLY after the envelope exists.
      // If upload fails, throw so the envelope is NOT sent.
      if (attachments.length > 0) {
        try {
          await uploadAttachments(attachments, env.id);
        } catch (uploadErr) {
          setEmailError(
            uploadErr instanceof Error
              ? uploadErr.message
              : 'Could not upload an attachment. The envelope was created but not sent.',
          );
          pushToast('Envelope created — attachment upload failed');
          setSent(env);
          return;
        }
      }

      if (send) {
        const res = await sendEnvelopeEmail(env.id);
        if (!res.ok) {
          setEmailError(
            res.error || 'Envelope saved as draft but the email could not be sent.',
          );
          pushToast('Saved as draft — email failed');
        } else if (res.attachmentFailures && res.attachmentFailures > 0) {
          pushToast(
            `Envelope sent ✓ · ${res.attachmentFailures} attachment(s) were skipped`,
          );
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
  const firstActive = sent?.recipients?.find((r) => r.status === 'active') ?? sent?.recipients?.[0];

  return (
    <Modal open={open} onClose={onClose} maxWidth={720}>
      {sent ? (
        <>
          <h3>Envelope {sent.status === 'sent' ? 'sent ✓' : 'created'}</h3>
          <p style={{ marginBottom: 10 }}>
            {sent.status === 'sent' && firstActive ? (
              <>
                Envelope sent successfully to <strong>{esc(firstActive.name)}</strong>{' '}
                <span className="muted">&lt;{esc(firstActive.email)}&gt;</span>.
                {sent.signingMode === 'sequential' && (sent.recipients?.length ?? 0) > 1 && (
                  <>
                    {' '}
                    The next recipient will be notified automatically after the first signature.
                  </>
                )}
              </>
            ) : (
              <>The envelope is saved as a draft. You can send it later from the envelope detail page.</>
            )}
          </p>

          {sent.status === 'sent' && firstActive && (
            <>
              <div className="field">
                <label>Recipients</label>
                <ol style={{ marginLeft: 18 }}>
                  {(sent.recipients ?? []).map((r) => {
                    const state =
                      r.status === 'active'
                        ? '→ awaiting signature'
                        : r.status === 'signed'
                          ? '✓ signed'
                          : r.status === 'declined'
                            ? '✗ declined'
                            : '○ pending';
                    return (
                      <li key={r.id} className="muted">
                        <strong style={{ color: 'var(--ink)' }}>{esc(r.name)}</strong>{' '}
                        <span>
                          ({ROLE_LABEL[r.role]}) — {r.email}
                        </span>{' '}
                        <em>{state}</em>
                      </li>
                    );
                  })}
                </ol>
              </div>
              <div className="field">
                <label>Signing link (first recipient)</label>
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
                <label>Access code (share only with the first recipient)</label>
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
              <p className="muted" style={{ marginBottom: 12 }}>
                Add every recipient in the order they should sign. The first recipient signs, then the
                next is notified automatically (sequential signing).
              </p>

              {recipients.length === 0 && (
                <div className="empty" style={{ border: '1px dashed var(--line)', borderRadius: 8, marginBottom: 12 }}>
                  <div className="big">No recipients yet</div>
                  Add the client, a countersigner and any additional signers below.
                </div>
              )}

              {recipients.map((r, i) => {
                const p = personFor(r);
                return (
                  <div
                    key={r.key}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                      padding: 14,
                      marginBottom: 10,
                      background: '#fbfbf9',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <strong>Recipient {i + 1}</strong>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn ghost sm"
                          disabled={i === 0}
                          onClick={() => moveRecipient(i, -1)}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          className="btn ghost sm"
                          disabled={i === recipients.length - 1}
                          onClick={() => moveRecipient(i, 1)}
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          className="btn danger sm"
                          onClick={() => removeRecipient(r.key)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="grid g2">
                      <div className="field">
                        <label>Person</label>
                        <select
                          value={r.personId ?? ''}
                          onChange={(e) => {
                            const id = e.target.value;
                            const person = people.find((x) => x.id === id);
                            if (person) {
                              updateRecipient(r.key, {
                                personId: person.id,
                                name: person.name,
                                email: person.email,
                              });
                            } else {
                              updateRecipient(r.key, { personId: null });
                            }
                          }}
                        >
                          <option value="">— New / external person —</option>
                          {people.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name} — {x.email} ({x.type})
                            </option>
                          ))}
                        </select>
                        {p && !p.email && (
                          <div className="notice warn" style={{ marginTop: 6 }}>
                            This person has no email. You can still enter one below, or add it in the
                            People tab.
                          </div>
                        )}
                      </div>
                      <div className="field">
                        <label>Role</label>
                        <select
                          value={r.role}
                          onChange={(e) =>
                            updateRecipient(r.key, { role: e.target.value as RecipientRole })
                          }
                        >
                          <option value="signer">Signer</option>
                          <option value="countersigner">Countersigner</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Name</label>
                        <input
                          value={r.name}
                          placeholder="Full name"
                          onChange={(e) => updateRecipient(r.key, { name: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Email</label>
                        <input
                          value={r.email}
                          placeholder="person@company.com"
                          onChange={(e) => updateRecipient(r.key, { email: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="muted">
                      Signing order: {i + 1}
                      {r.role === 'countersigner' ? ' · Countersigns after the previous signer' : ''}
                    </div>
                  </div>
                );
              })}

              <div style={{ marginBottom: 14 }}>
                <button className="btn ghost" onClick={() => addRecipient()}>
                  ＋ Add recipient
                </button>
                {people.length > 0 && (
                  <select
                    style={{ width: 'auto', marginLeft: 8, maxWidth: 280 }}
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) return;
                      const person = people.find((x) => x.id === id);
                      if (person) addRecipient(person);
                      e.target.value = '';
                    }}
                  >
                    <option value="">Quick add from People…</option>
                    {people.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} — {x.email} ({x.type})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <Field label="Signing mode">
                <label
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: 8,
                    border: `1px solid ${signingMode === 'sequential' ? 'var(--cobalt)' : 'var(--line)'}`,
                    borderRadius: 8,
                    marginBottom: 6,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    style={{ width: 'auto' }}
                    checked={signingMode === 'sequential'}
                    onChange={() => setSigningMode('sequential')}
                  />
                  <span>
                    <strong>Sequential signing</strong>
                    <div className="muted">
                      Recipients sign one after another in order. The next recipient is notified only
                      after the previous one signs.
                    </div>
                  </span>
                </label>
                <label
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: 8,
                    border: `1px solid ${signingMode === 'simultaneous' ? 'var(--cobalt)' : 'var(--line)'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    style={{ width: 'auto' }}
                    checked={signingMode === 'simultaneous'}
                    onChange={() => setSigningMode('simultaneous')}
                  />
                  <span>
                    <strong>Sign simultaneously</strong>
                    <div className="muted">
                      All recipients are emailed at once and may sign in any order.
                    </div>
                  </span>
                </label>
              </Field>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <button className="btn ghost" onClick={() => setStep(1)}>
                  ← Back
                </button>
                <button
                  className="btn primary"
                  disabled={recipients.length === 0}
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
                Merge fields detected in the template. Pre-filled from the first recipient
                ({primary?.name || 'a person record'}) and settings where possible — review and edit
                each value.
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

          {step === 4 && tpl && (
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

          {step === 5 && tpl && (
            <>
              <div className="field">
                <label>Document</label>
                <div>{esc(tpl.name)}</div>
              </div>
              <div className="field">
                <label>Signing workflow</label>
                <ol style={{ marginLeft: 18 }}>
                  {recipients.map((r, i) => (
                    <li key={r.key} className="muted" style={{ marginBottom: 2 }}>
                      <strong style={{ color: 'var(--ink)' }}>{i + 1}. {esc(r.name)}</strong>{' '}
                      <span>
                        ({ROLE_LABEL[r.role]}) — {esc(r.email)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="field">
                <label>Signing mode</label>
                <div>{signingMode === 'sequential' ? 'Sequential' : 'Simultaneous'}</div>
              </div>
              <div className="field">
                <label>Attachments</label>
                {attachments.length === 0 ? (
                  <div
                    style={{
                      border: '1px dashed var(--line)',
                      borderRadius: 8,
                      padding: '12px 14px',
                      margin: '4px 0 8px',
                    }}
                  >
                    <p className="muted">No attachments added</p>
                  </div>
                ) : (
                  <div style={{ margin: '4px 0 8px' }}>
                    {attachments.map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '7px 10px',
                          border: '1px solid var(--line)',
                          borderRadius: 7,
                          marginBottom: 6,
                          background: '#fbfbf9',
                        }}
                      >
                        <span style={{ fontSize: 13 }}>📎</span>
                        <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {esc(f.name)}
                        </span>
                        <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                          {formatSize(f.size)}
                        </span>
                        <button
                          className="btn danger sm"
                          disabled={sending}
                          onClick={() => removeAttachment(i)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
                  onChange={handleAttachmentSelect}
                />
                <button
                  className="btn ghost sm"
                  disabled={sending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {attachments.length === 0 ? '＋ Add attachment' : '＋ Add another attachment'}
                </button>
                {attachmentError && (
                  <div className="notice warn" style={{ marginTop: 8 }}>{attachmentError}</div>
                )}
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
                On send: a SHA-256 fingerprint of the merged document is sealed, each recipient gets
                its own secure signing link and one-time access code, and the first recipient is
                emailed a secure link. Subsequent recipients are emailed automatically as the signing
                order progresses.
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
                    {sending ? 'Sending…' : 'Send envelope'}
                  </button>
                </div>
              </div>
              {!canSend && (
                <p className="muted" style={{ marginTop: 8 }}>
                  {recipients.length === 0
                    ? 'Add at least one recipient.'
                    : 'Every recipient needs a name and email, and all detected merge fields must be filled before sending.'}
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
