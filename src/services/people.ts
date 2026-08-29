import { supabase } from '../lib/supabaseClient';

export async function getPeople() {
  const { data, error } = await supabase
    .from('people')
    .select('*');

  if (error) {
    console.error('Error getting people:', error);
    throw error;
  }

  return data ?? [];
}