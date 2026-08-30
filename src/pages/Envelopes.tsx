import { useEffect, useMemo, useState } from 'react';
import { useEnvelopes, refreshEnvelopes } from '../lib/useEnvelopes';
import { EnvelopeTable } from '../components/envelopes/EnvelopeTable';
import { EnvelopeFilters } from '../components/envelopes/EnvelopeFilters';
import { NewEnvelope } from './NewEnvelope';
import { Modal } from '../components/ui/Modal';
import { deleteEnvelope } from '../services/envelopes';
import { pushToast } from '../lib/toast';
import { isExpired } from '../lib/utils';
import type { Envelope } from '../types/envelope';

export function Envelopes({ onOpenEnvelope }: { onOpenEnvelope: (id: string) => void }) {
  const rows = useEnvelopes();
  const [q, setQ] = useState('');
  const [s, setS] = useState('');
  const [wizard, setWizard] = useState(false);
  const [toDelete, setToDelete] = useState<Envelope | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    refreshEnvelopes();
  }, []);

  const filtered = useMemo(() => {
    let r = rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const ql = q.trim().toLowerCase();
    if (ql) r = r.filter((x) => (x.title + ' ' + x.signerName + ' ' + x.signerEmail).toLowerCase().includes(ql));
    if (s) r = r.filter((x) => (isExpired(x) ? 'expired' : x.status) === s);
    return r;
  }, [rows, q, s]);

  const confirmDelete = async () => {
    const env = toDelete;
    if (!env || deleting) return;
    setDeleting(true);
    try {
      await deleteEnvelope(env.id);
      setToDelete(null);
      refreshEnvelopes();
      pushToast('Envelope deleted successfully.');
    } catch (err) {
      console.error('[Envelopes] deleteEnvelope failed', err);
      pushToast('Unable to delete envelope. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="section-title">
        <h2>All envelopes</h2>
        <button className="btn primary" onClick={() => setWizard(true)}>
          ＋ New envelope
        </button>
      </div>
      <EnvelopeFilters q={q} s={s} onQ={setQ} onS={setS} />
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <EnvelopeTable rows={filtered} onOpen={onOpenEnvelope} onDelete={setToDelete} />
      </div>
      <NewEnvelope open={wizard} onClose={() => { setWizard(false); refreshEnvelopes(); }} />

      <Modal open={!!toDelete} onClose={() => { if (!deleting) setToDelete(null); }}>
        {toDelete && (
          <>
            <h3>Delete this envelope?</h3>
            <p className="muted" style={{ marginBottom: 16 }}>
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn ghost" disabled={deleting} onClick={() => setToDelete(null)}>
                Cancel
              </button>
              <button className="btn danger" disabled={deleting} onClick={confirmDelete}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
