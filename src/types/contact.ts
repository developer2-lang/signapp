export type PersonType = 'employee' | 'vendor';

/**
 * A contact / person (employee or vendor) that can be selected as a signer.
 * In the next phase this maps directly to the Supabase contacts table, so the
 * ContactSelector is built to receive these from a remote source.
 */
export interface Contact {
  id: string;
  name: string;
  email: string;
  type: PersonType;
  designation: string;
  address: string;
}
