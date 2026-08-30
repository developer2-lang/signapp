import { useEffect, useState } from 'react';
import { AppHeader } from './components/layout/AppHeader';
import { AdminShell } from './components/layout/AdminShell';
import { PinModal } from './components/layout/PinModal';
import { SignerPortal } from './pages/SignDocument';
import { Toasts } from './components/ui/Toasts';
import { initDB, getDB } from './lib/store';

function tokenFromPath(p: string): string | null {
  const i = p.indexOf('/sign/');
  if (i < 0) return null;
  const seg = p.slice(i + 6).split(/[/#?]/)[0];
  return seg || null;
}

function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname + window.location.hash);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname + window.location.hash);
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);
  const navigate = (to: string) => {
    if (to.startsWith('#')) {
      window.location.hash = to.slice(1);
    } else {
      window.history.pushState({}, '', to);
      setPath(window.location.pathname + window.location.hash);
    }
  };
  return { path, navigate };
}

export default function App() {
  const [role, setRole] = useState<'admin' | 'signer'>('admin');
  const [unlocked, setUnlocked] = useState(true);
  const { path, navigate } = useRoute();

  useEffect(() => {
    (async () => {
      await initDB();
      setUnlocked(!getDB().settings.pinHash);
    })();
  }, []);

  const token = tokenFromPath(path);

  const setRoleHandler = (r: 'admin' | 'signer') => {
    if (r === 'signer') {
      setRole('signer');
    } else {
      setUnlocked(!getDB().settings.pinHash);
      setRole('admin');
    }
  };

  // A signing link always wins — render the signer portal directly.
  if (token) {
    return (
      <>
        <SignerPortal token={token} onHome={() => navigate('/')} />
        <Toasts />
      </>
    );
  }

  return (
    <>
      <AppHeader role={role} onRole={setRoleHandler} />
      {role === 'admin' ? (
        <AdminShell />
      ) : (
        <SignerPortal
          onToken={(t) => navigate('#/sign/' + t)}
          onHome={() => {
            setRole('admin');
            navigate('/');
          }}
        />
      )}
      {role === 'admin' && !unlocked && (
        <PinModal onUnlock={() => setUnlocked(true)} onGoSigner={() => setRole('signer')} />
      )}
      <Toasts />
    </>
  );
}
