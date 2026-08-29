import type { Contact } from '../../types/contact';

export function ContactTable({
  people,
  onEdit,
  onDelete,
}: {
  people: Contact[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!people.length) {
    return (
      <div className="empty">
        <div className="big">No people yet</div>
        Add new joiners and vendors here — their details auto-fill into letters.
      </div>
    );
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Type</th>
          <th>Designation / entity</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {people.map((p) => (
          <tr key={p.id}>
            <td>
              <strong>{p.name}</strong>
            </td>
            <td>{p.email}</td>
            <td>
              <span className={`pill ${p.type === 'vendor' ? 'sent' : 'completed'}`}>{p.type}</span>
            </td>
            <td>{p.designation || '—'}</td>
            <td style={{ textAlign: 'right' }}>
              <button className="btn ghost sm" onClick={() => onEdit(p.id)}>
                Edit
              </button>
              <button className="btn danger sm" onClick={() => onDelete(p.id)}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
