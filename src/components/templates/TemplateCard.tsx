import type { Template } from '../../types/template';

export function TemplateCard({
  tpl,
  onEdit,
  onDelete,
}: {
  tpl: Template;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const fields = [...new Set([...tpl.body.matchAll(/{{\s*([\w]+)\s*}}/g)].map((m) => m[1]))];
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>{tpl.name}</h3>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <span className={`pill ${tpl.kind === 'vendor' ? 'sent' : 'completed'}`}>{tpl.kind}</span>
            {tpl.letterhead && <span className="pill draft">🖼 letterhead</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn ghost sm" onClick={() => onEdit(tpl.id)}>
            Edit
          </button>
          <button className="btn danger sm" onClick={() => onDelete(tpl.id)}>
            Delete
          </button>
        </div>
      </div>
      <p className="muted" style={{ margin: '10px 0 6px' }}>
        {fields.length} merge fields:
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {fields.map((f) => (
          <span className="hash-chip" key={f}>
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}
