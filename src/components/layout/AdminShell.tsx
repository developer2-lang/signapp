import { useState } from 'react';
import { Dashboard } from '../../pages/Dashboard';
import { Envelopes } from '../../pages/Envelopes';
import { Templates } from '../../pages/Templates';
import { People } from '../../pages/People';
import { Settings } from '../../pages/Settings';
import { EnvelopeDetails } from '../../pages/EnvelopeDetails';

type Tab = 'dash' | 'envelopes' | 'templates' | 'people' | 'settings' | 'detail';

export function AdminShell() {
  const [tab, setTab] = useState<Tab>('dash');
  const [detailId, setDetailId] = useState<string | null>(null);

  const go = (t: Tab) => {
    setTab(t);
    if (t !== 'detail') setDetailId(null);
  };
  const openEnvelope = (id: string) => {
    setDetailId(id);
    setTab('detail');
  };

  return (
    <>
      <div className="tabs">
        <button className={tab === 'dash' ? 'on' : ''} onClick={() => go('dash')}>
          Dashboard
        </button>
        <button className={tab === 'envelopes' ? 'on' : ''} onClick={() => go('envelopes')}>
          Envelopes
        </button>
        <button className={tab === 'templates' ? 'on' : ''} onClick={() => go('templates')}>
          Templates
        </button>
        <button className={tab === 'people' ? 'on' : ''} onClick={() => go('people')}>
          People
        </button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => go('settings')}>
          Settings
        </button>
      </div>
      {tab === 'dash' && <Dashboard onOpenEnvelope={openEnvelope} />}
      {tab === 'envelopes' && <Envelopes onOpenEnvelope={openEnvelope} />}
      {tab === 'templates' && <Templates />}
      {tab === 'people' && <People />}
      {tab === 'settings' && <Settings />}
      {tab === 'detail' && detailId && (
        <EnvelopeDetails id={detailId} onBack={() => go('envelopes')} />
      )}
    </>
  );
}
