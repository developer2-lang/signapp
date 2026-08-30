import { supabase } from '../lib/supabaseClient';
import { getTypeMaps, type TypeMaps } from './peopleTypes';
import type { Contact, PersonType } from '../types/contact';

export interface PersonInput {
  name: string;
  email: string;
  type: PersonType;
  designation: string;
  address: string;
}

function rowToContact(row: any, maps: TypeMaps): Contact {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    type: (maps.kindById[row.type_id] as PersonType) ?? 'employee',
    designation: row.designation_entity ?? '',
    address: row.address ?? '',
  };
}

export async function listPeople(): Promise<Contact[]> {
  console.log('Loading people from Supabase...');

  const { data, error } = await supabase
    .from('people')
    .select('*')
    .order('full_name');

  if (error) {
    console.error('Supabase people error:', error);
    throw error;
  }

  const maps = await getTypeMaps();
  const result = (data ?? []).map((row: any) => rowToContact(row, maps));

  console.log('People from Supabase:', result);
  return result;
}

export async function getPerson(id: string): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Supabase getPerson error:', error);
    throw error;
  }

  if (!data) return null;

  const maps = await getTypeMaps();
  return rowToContact(data, maps);
}

export async function savePerson(
  id: string | null,
  input: PersonInput,
): Promise<Contact> {
  console.log('Saving person:', input);

  const maps = await getTypeMaps();
  const type_id = maps.idByKind[input.type];

  if (!type_id) {
    const msg = `Unknown person type: ${input.type}`;
    console.error(msg);
    throw new Error(msg);
  }

  const payload = {
    full_name: input.name,
    email: input.email,
    type_id,
    designation_entity: input.designation,
    address: input.address,
  };

  if (id) {
    const { data, error } = await supabase
      .from('people')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update person error:', error);
      throw error;
    }

    return rowToContact(data, maps);
  }

  const { data, error } = await supabase
    .from('people')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Supabase create person error:', error);
    throw error;
  }

  return rowToContact(data, maps);
}

export async function deletePerson(id: string): Promise<void> {
  console.log('Deleting person:', id);

  const { error } = await supabase.from('people').delete().eq('id', id);

  if (error) {
    console.error('Supabase delete person error:', error);
    throw error;
  }
}
