import { supabase } from '../lib/supabaseClient';
import mammoth from 'mammoth/mammoth.browser';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

import type { Template, TemplateKind } from '../types/template';
import { getTypeMaps, type TypeMaps } from './peopleTypes';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface TemplateInput {
  name: string;
  kind: TemplateKind;
  body: string;
  letterhead: string | null;
}

function rowToTemplate(row: any, maps: TypeMaps): Template {
  return {
    id: row.id,
    name: row.name,
    kind: (maps.kindById[row.type_id] as TemplateKind) ?? 'employee',
    body: row.body ?? '',
    letterhead: row.storage_path ?? null,
  };
}

export async function listTemplates(): Promise<Template[]> {
  console.log('Loading templates from Supabase...');

  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('name');

  if (error) {
    console.error('Supabase template error:', error);
    throw error;
  }

  const maps = await getTypeMaps();
  const result = (data ?? []).map((row: any) => rowToTemplate(row, maps));

  console.log('Templates from Supabase:', result);
  return result;
}

export async function getTemplate(id: string): Promise<Template | null> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Supabase getTemplate error:', error);
    throw error;
  }

  if (!data) return null;

  const maps = await getTypeMaps();
  return rowToTemplate(data, maps);
}

export async function saveTemplate(
  id: string | null,
  input: TemplateInput,
): Promise<Template> {
  console.log('Creating/updating template:', input);

  const maps = await getTypeMaps();
  const type_id = maps.idByKind[input.kind];

  if (!type_id) {
    const msg = `Unknown template kind: ${input.kind}`;
    console.error(msg);
    throw new Error(msg);
  }

  const payload = {
    name: input.name,
    type_id,
    body: input.body,
    storage_path: input.letterhead,
  };

  if (id) {
    const { data, error } = await supabase
      .from('templates')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase template error:', error);
      throw error;
    }

    return rowToTemplate(data, maps);
  }

  const { data, error } = await supabase
    .from('templates')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Supabase template error:', error);
    throw error;
  }

  return rowToTemplate(data, maps);
}

export async function deleteTemplate(id: string): Promise<void> {
  console.log('Deleting template:', id);

  const { error } = await supabase.from('templates').delete().eq('id', id);

  if (error) {
    console.error('Supabase template error:', error);
    throw error;
  }
}

/* Keep your existing extractTemplateText function below this point */
export async function extractTemplateText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'docx') {
    const buf = await file.arrayBuffer();
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    return r.value;
  }

  if (ext === 'pdf') {
    const pdf = await pdfjsLib.getDocument({
      data: await file.arrayBuffer(),
    }).promise;

    let text = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();

      let lastY: number | null = null;
      let line = '';
      const lines: string[] = [];

      tc.items.forEach((it: any) => {
        const y = Math.round(it.transform[5]);

        if (lastY !== null && Math.abs(y - lastY) > 2) {
          lines.push(line.trimEnd());
          line = '';
        }

        line += it.str + (it.str.endsWith(' ') ? '' : ' ');
        lastY = y;
      });

      lines.push(line.trimEnd());
      text += lines.join('\n') + '\n\n';
    }

    return text.trim();
  }

  if (ext === 'txt' || ext === 'md') {
    return (await file.text()).trim();
  }

  if (ext === 'doc') {
    throw new Error('legacy-doc');
  }

  throw new Error('unsupported');
}
