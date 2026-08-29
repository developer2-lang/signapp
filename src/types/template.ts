export type TemplateKind = 'employee' | 'vendor';

export interface Template {
  id: string;
  name: string;
  kind: TemplateKind;
  body: string;
  /** optional banner letterhead that overrides the company default */
  letterhead: string | null;
}
