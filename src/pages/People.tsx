import { useEffect, useState } from 'react';

import { ContactTable } from '../components/contacts/ContactTable';
import { ContactEditor } from '../components/contacts/ContactEditor';

import { listPeople, deletePerson } from '../services/people';

import type { Contact } from '../types/contact';

export function People() {
  const [people, setPeople] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Contact | null>(null);

  async function loadPeople() {
    try {
      setLoading(true);
      setError(null);
      const data = await listPeople();
      setPeople(data);
    } catch (err: any) {
      console.error('SUPABASE PEOPLE ERROR:', err);
      setError(err.message || 'Failed to load people');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPeople();
  }, []);

  const openNew = () => {
    setEditTarget(null);
    setEditorOpen(true);
  };

  const openEdit = (id: string) => {
    const p = people.find((x) => x.id === id) ?? null;
    setEditTarget(p);
    setEditorOpen(true);
  };

  const doDelete = async (id: string) => {
    if (confirm('Delete this person? This removes the row from Supabase.')) {
      await deletePerson(id);
      await loadPeople();
    }
  };

  if (loading) {
    return <div style={{ padding: 30 }}>Loading people...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 30, color: 'red' }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">
        <h2>Employees &amp; vendors</h2>
        <button className="btn primary" onClick={openNew}>
          ＋ New person
        </button>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <ContactTable
          people={people}
          onEdit={openEdit}
          onDelete={doDelete}
        />
      </div>

      <ContactEditor
        open={editorOpen}
        editing={editTarget}
        onClose={() => {
          setEditorOpen(false);
          loadPeople();
        }}
      />
    </div>
  );
}
