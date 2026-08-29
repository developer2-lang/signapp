interface AppHeaderProps {
  role: 'admin' | 'signer';
  onRole: (r: 'admin' | 'signer') => void;
}

export function AppHeader({ role, onRole }: AppHeaderProps) {
  return (
    <header className="app">
      <div className="brand">
        <span className="wordmark">IUOVA SIGN</span>
        <span className="sub">Digital Execution Desk · IT Act 2000 §10A</span>
      </div>
      <div className="role-switch" role="tablist" aria-label="Portal">
        <button className={role === 'admin' ? 'on' : ''} onClick={() => onRole('admin')}>
          Admin
        </button>
        <button className={role === 'signer' ? 'on' : ''} onClick={() => onRole('signer')}>
          Signer portal
        </button>
      </div>
    </header>
  );
}
