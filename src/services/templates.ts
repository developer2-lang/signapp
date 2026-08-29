import { supabase } from '../lib/supabaseClient';
import mammoth from 'mammoth/mammoth.browser';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

import type { Template, TemplateKind } from '../types/template';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface TemplateInput {
  name: string;
  kind: TemplateKind;
  body: string;
  letterhead: string | null;
}

export async function listTemplates(): Promise<Template[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error loading templates:', error);
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    kind: row.kind ?? row.type ?? 'employee',
    body: row.body ?? '',
    letterhead: row.storage_path ?? null,
  }));
}

export async function saveTemplate(
  id: string | null,
  input: TemplateInput
): Promise<Template> {

  if (id) {
    const { data, error } = await supabase
      .from('templates')
      .update({
        name: input.name,
        body: input.body,
        storage_path: input.letterhead,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating template:', error);
      throw error;
    }

    return {
      id: data.id,
      name: data.name,
      kind: input.kind,
      body: data.body ?? '',
      letterhead: data.storage_path ?? null,
    };
  }

  const { data, error } = await supabase
    .from('templates')
    .insert({
      name: input.name,
      body: input.body,
      storage_path: input.letterhead,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating template:', error);
    throw error;
  }

  return {
    id: data.id,
    name: data.name,
    kind: input.kind,
    body: data.body ?? '',
    letterhead: data.storage_path ?? null,
  };
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('templates')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting template:', error);
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
      data: await file.arrayBuffer()
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