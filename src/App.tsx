import { useEffect, useState } from 'react';
import { AppHeader } from './components/layout/AppHeader';
import { AdminShell } from './components/layout/AdminShell';
import { PinModal } from './components/layout/PinModal';
import { SignerPortal } from './pages/SignDocument';
import { Toasts } from './components/ui/Toasts';
import { initDB, getDB } from './lib/store';

export default function App() {
  const [role, setRole] = useState<'admin' | 'signer'>('admin');
  const [unlocked, setUnlocked] = useState(true);

  useEffect(() => {
    (async () => {
      await initDB();
      setUnlocked(!getDB().settings.pinHash);
    })();
  }, []);

  const setRoleHandler = (r: 'admin' | 'signer') => {
    if (r === 'signer') {
      setRole('signer');
    } else {
      setUnlocked(!getDB().settings.pinHash);
      setRole('admin');
    }
  };

  return (
    <>
      <AppHeader role={role} onRole={setRoleHandler} />
      {role === 'admin' ? <AdminShell /> : <SignerPortal />}
      {role === 'admin' && !unlocked && (
        <PinModal onUnlock={() => setUnlocked(true)} onGoSigner={() => setRole('signer')} />
      )}
      <Toasts />
    </>
  );
}
