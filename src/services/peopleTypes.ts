import { supabase } from '../lib/supabaseClient';

export interface TypeMaps {
  /** type_id (uuid) -> 'employee' | 'vendor' */
  kindById: Record<string, string>;
  /** 'employee' | 'vendor' -> type_id (uuid) */
  idByKind: Record<string, string>;
}

let cache: TypeMaps | null = null;

export async function getTypeMaps(): Promise<TypeMaps> {
  if (cache) return cache;

  const { data, error } = await supabase
    .from('people-type')
    .select('id, name');

  if (error) {
    console.error('Supabase people-type error:', error);
    throw error;
  }

  const kindById: Record<string, string> = {};
  const idByKind: Record<string, string> = {};

  (data ?? []).forEach((row: any) => {
    const kind = String(row.name ?? '').trim().toLowerCase();
    kindById[row.id] = kind;
    idByKind[kind] = row.id;
  });

  cache = { kindById, idByKind };
  return cache;
}
