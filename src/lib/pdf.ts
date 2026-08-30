import { jsPDF } from 'jspdf';
import { getDB } from './store';
import { fmt } from './utils';
import type { Envelope } from '../types/envelope';
import { pushToast } from './toast';

/**
 * Generate and download the final signed PDF for a completed (or in-progress)
 * envelope. The data is passed in (the envelope now lives in Supabase); the
 * company settings are still read from the local store.
 */
export function downloadPDF(e: Envelope): void {
  const s = getDB().settings;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = 595;
  const M = 56;
  const CW = W - M * 2;
  let y = 64;

  const line = (txt: string, size?: number, style?: string, gap?: number) => {
    doc.setFont('helvetica', (style as any) || 'normal');
    doc.setFontSize(size || 10.5);
    const rows = doc.splitTextToSize(txt, CW);
    rows.forEach((r: string) => {
      if (y > 780) {
        doc.addPage();
        y = 64;
      }
      doc.text(r, M, y);
      y += (size || 10.5) * 1.45;
    });
    y += gap || 0;
  };

  // Letterhead
  if (e.letterhead) {
    try {
      const props = doc.getImageProperties(e.letterhead);
      const lhH = Math.min(120, (CW * props.height) / props.width);
      doc.addImage(e.letterhead, M, y - 28, CW, lhH, undefined, 'FAST');
      y += lhH - 14;
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(s.company.toUpperCase(), M, y);
      y += 16;
    }
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(`ENVELOPE ${e.id.toUpperCase()}`, M, y);
    doc.setTextColor(0);
    y += 8;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(s.company.toUpperCase(), M, y);
    y += 16;
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(`${s.address}  ·  ENVELOPE ${e.id.toUpperCase()}`, M, y);
    doc.setTextColor(0);
    y += 8;
  }
  doc.setLineWidth(1.4);
  doc.line(M, y, W - M, y);
  y += 24;

  // Body
  e.body.split('\n').forEach((p) => {
    if (p.trim() === '') y += 8;
    else line(p, 10.5, 'normal', 2);
  });
  y += 26;

  // Signatures
  const sigY = y > 640 ? (doc.addPage(), (y = 80)) : y;
  const drawSig = (sig: Envelope['signature'], x: number, who: string, meta: string[]) => {
    let yy = sigY;
    if (sig) {
      if (sig.dataURL) {
        try {
          const p = doc.getImageProperties(sig.dataURL);
          let sw = 130;
          let sh = (sw * p.height) / p.width;
          if (sh > 46) {
            sh = 46;
            sw = (sh * p.width) / p.height;
          }
          doc.addImage(sig.dataURL, x, yy + (46 - sh), sw, sh, undefined, 'FAST');
        } catch {
          /* ignore */
        }
      } else {
        doc.setFont('times', 'italic');
        doc.setFontSize(22);
        doc.text(sig.text || '', x, yy + 38);
      }
    }
    yy += 52;
    doc.setLineWidth(0.8);
    doc.line(x, yy, x + 190, yy);
    yy += 13;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(who, x, yy);
    yy += 11;
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(110);
    meta.forEach((m) => {
      doc.text(m, x, yy);
      yy += 9;
    });
    doc.setTextColor(0);
  };
  drawSig(
    e.signature,
    M,
    e.signerName,
    e.signature
      ? [`Digitally signed ${fmt(e.signature.at)}`, `sig-hash ${e.signature.hash.slice(0, 32)}`]
      : ['Signature pending'],
  );
  drawSig(
    e.countersignature,
    M + 250,
    `${s.signerName} — ${s.signerTitle}`,
    e.countersignature
      ? [
          `Digitally countersigned ${fmt(e.countersignature.at)}`,
          `sig-hash ${e.countersignature.hash.slice(0, 32)}`,
        ]
      : ['Countersignature pending'],
  );

  // Certificate of completion
  doc.addPage();
  y = 64;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('CERTIFICATE OF COMPLETION', M, y);
  y += 14;
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text('Electronic execution record · IT Act 2000 §10A · Indian Evidence Act §65B', M, y);
  doc.setTextColor(0);
  y += 8;
  doc.setLineWidth(1.4);
  doc.line(M, y, W - M, y);
  y += 24;

  const kv = (k: string, v: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(k, M, y);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    const rows = doc.splitTextToSize(v, CW - 130);
    doc.text(rows, M + 130, y);
    y += Math.max(13, rows.length * 10 + 4);
  };
  kv('Envelope ID', e.id);
  kv('Document', e.title);
  kv('Signer', `${e.signerName} <${e.signerEmail}>`);
  kv('Countersignatory', `${s.signerName}, ${s.signerTitle}, ${s.company}`);
  kv('Document SHA-256', e.docHash || '—');
  if (e.signature) kv('Signer sig-hash', e.signature.hash);
  if (e.countersignature) kv('Countersign sig-hash', e.countersignature.hash);
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Audit trail', M, y);
  y += 16;
  e.events.forEach((ev) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    if (y > 780) {
      doc.addPage();
      y = 64;
    }
    doc.text(`• ${fmt(ev.at)} — ${ev.label}`, M, y, { maxWidth: CW });
    y += 12;
    if (ev.hash) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.6);
      doc.setTextColor(110);
      doc.text(`  sha256 ${ev.hash}`, M, y);
      doc.setTextColor(0);
      y += 10;
    }
    if (ev.ua) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.6);
      doc.setTextColor(110);
      doc.text(`  device ${ev.ua.slice(0, 90)}`, M, y);
      doc.setTextColor(0);
      y += 12;
    }
  });
  y += 14;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text(
    doc.splitTextToSize(
      'This document was executed electronically via IUOVA Sign. The parties consented to electronic execution under Section 10A of the Information Technology Act, 2000. The SHA-256 fingerprints above allow independent verification that the document text has not been altered since execution.',
      CW,
    ),
    M,
    y,
  );
  doc.save(`${e.title.replace(/[^\w\- ]/g, '')}.pdf`);
  pushToast('PDF downloaded');
}
