import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Field } from '../ui/Field';
import { savePerson, deletePerson } from '../../services/people';
import { pushToast } from '../../lib/toast';
import type { Contact, PersonType } from '../../types/contact';

export function ContactEditor({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: Contact | null;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState<PersonType>('employee');
  const [designation, setDesignation] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setEmail(editing.email);
      setType(editing.type);
      setDesignation(editing.designation);
      setAddress(editing.address);
    } else {
      setName('');
      setEmail('');
      setType('employee');
      setDesignation('');
      setAddress('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const save = () => {
    if (!name.trim() || !email.trim()) {
      pushToast('Name and email are required');
      return;
    }
    savePerson(editing?.id ?? null, {
      name: name.trim(),
      email: email.trim(),
      type,
      designation: designation.trim(),
      address: address.trim(),
    });
    pushToast('Saved');
    onClose();
  };

  const remove = () => {
    if (editing && confirm('Remove this person?')) {
      deletePerson(editing.id);
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}>
      <h3>{editing ? 'Edit person' : 'Add person'}</h3>
      <Field label="Full name">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <div className="grid g2">
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as PersonType)}>
            <option value="employee">Employee</option>
            <option value="vendor">Vendor</option>
          </select>
        </Field>
        <Field label="Designation / entity">
          <input value={designation} onChange={(e) => setDesignation(e.target.value)} />
        </Field>
      </div>
      <Field label="Address">
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        {editing && (
          <button className="btn danger" onClick={remove}>
            Delete
          </button>
        )}
        <button className="btn primary" onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  );
}
