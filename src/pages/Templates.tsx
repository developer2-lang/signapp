import { useEffect, useState } from 'react';

import { TemplateCard } from '../components/templates/TemplateCard';
import { TemplateEditor } from '../components/templates/TemplateEditor';

import {
  listTemplates,
  deleteTemplate,
} from '../services/templates';

import type { Template } from '../types/template';

export function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  async function loadTemplates() {
    try {
      setLoading(true);
      setError(null);

      const data = await listTemplates();

      console.log('SUPABASE TEMPLATES:', data);

      setTemplates(data);
    } catch (err: any) {
      console.error('TEMPLATE ERROR:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  const openNew = () => {
    setEditId(null);
    setEditorOpen(true);
  };

  const openEdit = (id: string) => {
    setEditId(id);
    setEditorOpen(true);
  };

  const doDelete = async (id: string) => {
    if (
      confirm(
        'Delete this template? Existing envelopes keep their own copy of the text.'
      )
    ) {
      await deleteTemplate(id);
      await loadTemplates();
    }
  };

  return (
    <>
      <div className="section-title">
        <h2>Document templates</h2>

        <button
          className="btn primary"
          onClick={openNew}
        >
          ＋ New template
        </button>
      </div>

      <p className="muted" style={{ marginBottom: 14 }}>
        Merge fields use{' '}
        <code className="mono">
          {'{{field_name}}'}
        </code>
        . They're auto-detected and become a form when you create an envelope.
      </p>

      {loading && (
        <div className="card">
          Loading templates...
        </div>
      )}

      {error && (
        <div className="card" style={{ color: 'red' }}>
          Error loading templates: {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid g2">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              tpl={t}
              onEdit={openEdit}
              onDelete={doDelete}
            />
          ))}
        </div>
      )}

      <TemplateEditor
        open={editorOpen}
        editingId={editId}
        onClose={() => {
          setEditorOpen(false);
          loadTemplates();
        }}
      />
    </>
  );
}