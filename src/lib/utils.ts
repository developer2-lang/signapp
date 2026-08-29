import type { Envelope, DisplayStatus } from '../types/envelope';

/* ── IDs / tokens ── */
export const uid = (p: string): string =>
  p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const token = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12)
    .toUpperCase();

export const now = (): string => new Date().toISOString();

/* ── crypto ── */
export async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ── file helpers ── */
export function readAsDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export async function compressImage(
  file: File,
  maxW: number,
  jpegQ?: number,
): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('not an image');
  const url = await readAsDataURL(file);
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = rej;
    img.src = url;
  });
  const scale = Math.min(1, maxW / img.width);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  const ctx = c.getContext('2d')!;
  if (jpegQ) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return jpegQ ? c.toDataURL('image/jpeg', jpegQ) : c.toDataURL('image/png');
}

/* ── formatting ── */
export const fmt = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function esc(s?: unknown): string {
  return (s ?? '')
    .toString()
    .replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
    );
}

export const addDays = (d: number): string =>
  new Date(Date.now() + d * 864e5).toISOString();

/* ── merge fields ── */
const MERGE_RE = /{{\s*([\w]+)\s*}}/g;

export function detectMergeFields(body: string): string[] {
  return [...new Set([...body.matchAll(MERGE_RE)].map((m) => m[1]))];
}

export function mergeBody(body: string, fields: Record<string, string>): string {
  return body.replace(MERGE_RE, (_, f) => fields[f] || `[${f}]`);
}

/* ── status helpers ── */
export function isExpired(e: Envelope): boolean {
  return e.status === 'sent' && !!e.expiresAt && new Date(e.expiresAt) < new Date();
}

export function dispStatus(e: Envelope): DisplayStatus {
  return isExpired(e) ? 'expired' : e.status;
}

export function isStale(e: Envelope): boolean {
  if (e.status !== 'sent' || isExpired(e)) return false;
  const lastRelevant = e.events
    .filter((ev) => ['sent', 'viewed', 'reminder'].includes(ev.type))
    .pop();
  return !!lastRelevant && Date.now() - new Date(lastRelevant.at).getTime() > 72 * 36e5;
}

export const hoursBetween = (a: string, b: string): number =>
  (new Date(b).getTime() - new Date(a).getTime()) / 36e5;

export const fmtHrs = (h: number | null): string =>
  h == null ? '—' : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;

export interface StatusMeta {
  label: string;
  cls: string;
}

const STATUS_MAP: Record<DisplayStatus, StatusMeta> = {
  draft: { label: 'Draft', cls: 'draft' },
  sent: { label: 'Awaiting signer', cls: 'sent' },
  signed: { label: 'Awaiting countersign', cls: 'signed' },
  completed: { label: 'Completed', cls: 'completed' },
  declined: { label: 'Declined', cls: 'declined' },
  expired: { label: 'Expired', cls: 'expired' },
};

export function statusMeta(s: DisplayStatus): StatusMeta {
  return STATUS_MAP[s] || { label: s, cls: 'draft' };
}
