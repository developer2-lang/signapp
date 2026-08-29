import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Field } from '../ui/Field';
import { useDb } from '../../lib/useDb';
import { compressImage } from '../../lib/utils';
import { pushToast } from '../../lib/toast';
import { saveTemplate, extractTemplateText } from '../../services/templates';
import type { TemplateKind } from '../../types/template';

export function TemplateEditor({
  open,
  editingId,
  onClose,
}: {
  open: boolean;
  editingId: string | null;
  onClose: () => void;
}) {
  const db = useDb();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<TemplateKind>('employee');
  const [body, setBody] = useState('');
  const [letterhead, setLetterhead] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState('');
  const fileStatusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editingId) {
      const t = db.templates.find((x) => x.id === editingId);
      if (t) {
        setName(t.name);
        setKind(t.kind);
        setBody(t.body);
        setLetterhead(t.letterhead);
      }
    } else {
      setName('');
      setKind('employee');
      setBody('');
      setLetterhead(null);
    }
    setFileStatus('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  const onImport = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    setFileStatus('Reading ' + f.name + '…');
    try {
      const text = await extractTemplateText(f);
      if (!text.trim()) {
        setFileStatus('');
        pushToast('No text layer found — this looks like a scanned PDF');
      } else {
        setBody(text.trim());
        if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
        setFileStatus('✓ Imported ' + f.name + ' — now replace names, dates and amounts with {{merge_fields}}');
        pushToast('Text imported');
      }
    } catch (err) {
      setFileStatus('');
      if ((err as Error).message === 'legacy-doc') {
        pushToast('Legacy .doc isn’t readable in a browser — save as .docx in Word and re-upload');
      } else if ((err as Error).message === 'unsupported') {
        pushToast('Unsupported format — use .docx, .pdf or .txt');
      } else {
        pushToast('Could not read file: ' + ((err as Error).message || err));
      }
    }
    ev.target.value = '';
  };

  const onLetterhead = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const d = await compressImage(f, 1600, 0.85);
      setLetterhead(d);
      pushToast('Letterhead added');
    } catch {
      pushToast('Could not read image');
    }
    ev.target.value = '';
  };

  const save = () => {
    if (!name.trim() || !body.trim()) {
      pushToast('Name and body are required');
      return;
    }
    saveTemplate(editingId, { name: name.trim(), kind, body, letterhead });
    pushToast('Template saved');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={640}>
      <h3>{editingId ? 'Edit template' : 'New template'}</h3>
      <Field label="Import from a file (.docx, .pdf, .txt) — optional">
        <div className="up-drop">
          Upload an existing letter and its text lands in the editor below.
          <br />
          <input
            type="file"
            accept=".docx,.pdf,.txt,.md,.doc"
            style={{ marginTop: 10, border: 'none', padding: 0 }}
            onChange={onImport}
          />
          <div className="muted" ref={fileStatusRef} style={{ marginTop: 6 }}>
            {fileStatus}
          </div>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          Note: legacy .doc must be re-saved as .docx in Word first. Scanned PDFs (image-only) have no
          extractable text.
        </p>
      </Field>
      <Field label="Template name">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Type">
        <select value={kind} onChange={(e) => setKind(e.target.value as TemplateKind)}>
          <option value="employee">Employee</option>
          <option value="vendor">Vendor</option>
        </select>
      </Field>
      <Field label="Body — use {{field_name}} for merge fields">
        <textarea
          rows={14}
          style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <Field label="Letterhead for this template (PNG/JPG banner) — overrides the company default">
        {letterhead ? (
          <div className="up-preview">
            <img src={letterhead} alt="letterhead preview" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn ghost sm" onClick={() => document.getElementById('tplLhFile')?.click()}>
                Replace
              </button>
              <button
                className="btn danger sm"
                onClick={() => setLetterhead(null)}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button className="btn ghost sm" onClick={() => document.getElementById('tplLhFile')?.click()}>
            Upload letterhead image
          </button>
        )}
        <input
          type="file"
          id="tplLhFile"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onLetterhead}
        />
      </Field>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={save}>
          Save template
        </button>
      </div>
    </Modal>
  );
}
