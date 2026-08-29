import { useMemo, useState } from 'react';
import { useDb } from '../lib/useDb';
import { EnvelopeTable } from '../components/envelopes/EnvelopeTable';
import { EnvelopeFilters } from '../components/envelopes/EnvelopeFilters';
import { NewEnvelope } from './NewEnvelope';
import { isExpired } from '../lib/utils';
import { pushToast } from '../lib/toast';

export function Envelopes({ onOpenEnvelope }: { onOpenEnvelope: (id: string) => void }) {
  const db = useDb();
  const [q, setQ] = useState('');
  const [s, setS] = useState('');
  const [wizard, setWizard] = useState(false);

  const rows = useMemo(() => {
    let r = db.envelopes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const ql = q.trim().toLowerCase();
    if (ql) r = r.filter((x) => (x.title + ' ' + x.signerName + ' ' + x.signerEmail).toLowerCase().includes(ql));
    if (s) r = r.filter((x) => (isExpired(x) ? 'expired' : x.status) === s);
    return r;
  }, [db.envelopes, q, s]);

  const openWizard = () => {
    if (!db.people.length) {
      pushToast('Add a person first (People tab)');
      return;
    }
    setWizard(true);
  };

  return (
    <>
      <div className="section-title">
        <h2>All envelopes</h2>
        <button className="btn primary" onClick={openWizard}>
          ＋ New envelope
        </button>
      </div>
      <EnvelopeFilters q={q} s={s} onQ={setQ} onS={setS} />
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <EnvelopeTable rows={rows} onOpen={onOpenEnvelope} />
      </div>
      <NewEnvelope open={wizard} onClose={() => setWizard(false)} />
    </>
  );
}
