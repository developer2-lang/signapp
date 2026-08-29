import { useEffect, useState } from 'react';
import { useDb } from '../../lib/useDb';

export function AccessCodeScreen({
  onSubmit,
}: {
  onSubmit: (code: string) => void;
}) {
  const db = useDb();
  const [code, setCode] = useState('');

  useEffect(() => {
    const t = setTimeout(() => document.getElementById('accessCode')?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="card" style={{ maxWidth: 460, margin: '40px auto', textAlign: 'center', padding: 34 }}>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Sign your document</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        Enter the access code from your email or from {db.settings.company}.
      </p>
      <input
        id="accessCode"
        placeholder="e.g. 7XK2M9Q4RT01"
        style={{
          textAlign: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 16,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
        }}
        maxLength={12}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit(code)}
      />
      <button
        className="btn primary"
        style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
        onClick={() => onSubmit(code)}
      >
        Open document →
      </button>
    </div>
  );
}
