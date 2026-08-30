import { getDB, mutate } from './store';
import { uid, token, sha256, addDays, mergeBody } from './utils';
import type { Envelope } from '../types/envelope';
import type { Contact, PersonType } from '../types/contact';
import type { Signature } from '../types/signature';

const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const UA_DESK =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

const agoISO = (d: number, h = 0): string =>
  new Date(Date.now() - d * 864e5 - h * 36e5).toISOString();

function scribbleSig(seed: number): string {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 100;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#181B21';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let rnd = seed;
  const R = () => {
    rnd = (rnd * 9301 + 49297) % 233280;
    return rnd / 233280;
  };
  ctx.beginPath();
  ctx.moveTo(18, 62);
  for (let x = 18; x <= 270; x += 16) {
    ctx.quadraticCurveTo(x + 6, 20 + 55 * R(), x + 16, 45 + 30 * R());
  }
  ctx.stroke();
  return c.toDataURL('image/png');
}

interface DemoEnvOptions {
  tpl: string;
  p: Contact;
  status: Envelope['status'];
  token?: string;
  created: string;
  updated?: string;
  expiresAt?: string | null;
  reminders?: number;
  fields: Record<string, string>;
  sealed: boolean;
  signature?: Signature | null;
  counter?: Signature | null;
  events: Envelope['events'];
}

async function demoEnv(o: DemoEnvOptions): Promise<Envelope> {
  const t = getDB().templates.find((x) => x.id === o.tpl) || getDB().templates[0];
  const body = mergeBody(t.body, o.fields || {});
  const e: Envelope = {
    id: uid('env'),
    title: `${t.name} — ${o.p.name}`,
    templateName: t.name,
    body,
    fields: o.fields || {},
    letterhead: t.letterhead || getDB().settings.letterhead || null,
    signerId: o.p.id,
    signerName: o.p.name,
    signerEmail: o.p.email,
    status: o.status,
    token: o.token || token(),
    createdAt: o.created,
    updatedAt: o.updated || o.created,
    sentAt: null,
    completedAt: null,
    viewedAt: null,
    reminders: o.reminders || 0,
    expiresAt: o.expiresAt || null,
    docHash: null,
    signature: o.signature || null,
    countersignature: o.counter || null,
    countersignedAt: o.counter ? (o.updated || o.created) : null,
    events: o.events || [],
  };
  if (o.sealed) e.docHash = await sha256(`${body}|${e.id}|${o.p.email}`);
  if (e.signature && !e.signature.hash)
    e.signature.hash = await sha256(
      `${e.signature.dataURL || e.signature.text}|${e.docHash}|${e.signature.at}`,
    );
  if (e.countersignature && !e.countersignature.hash)
    e.countersignature.hash = await sha256(
      `${e.countersignature.dataURL || e.countersignature.text}|${e.docHash}|${e.countersignature.at}`,
    );
  e.events.forEach((ev) => {
    if (ev.type === 'sent') ev.hash = e.docHash || undefined;
    if (ev.type === 'signed' && e.signature) ev.hash = e.signature.hash;
    if (ev.type === 'countersigned' && e.countersignature) ev.hash = e.countersignature.hash;
  });
  return e;
}

export async function loadDemoData(): Promise<void> {
  const db = getDB();
  const s = db.settings;
  const addPerson = (
    name: string,
    email: string,
    type: PersonType,
    desig: string,
    addr: string,
  ): Contact => {
    const p: Contact = { id: uid('per'), name, email, type, designation: desig, address: addr };
    db.people.push(p);
    return p;
  };
  const p1 = addPerson('Sneha Kulkarni', 'sneha.k@example.com', 'employee', 'Senior Industrial Designer', 'Andheri West, Mumbai 400053');
  const p2 = addPerson('Rohan Deshpande', 'rohan.d@example.com', 'employee', 'Product Engineer', 'Thane West, Thane 400601');
  const p3 = addPerson('Mahesh Patil', 'mahesh@example.com', 'vendor', 'Precision Toolworks LLP', 'MIDC Bhosari, Pune 411026');
  const p4 = addPerson('Ananya Iyer', 'ananya.i@example.com', 'employee', 'CMF Designer', 'Powai, Mumbai 400076');
  const p5 = addPerson('Kavita Rao', 'kavita@example.com', 'vendor', 'Rao Prototyping Studio', 'Peenya, Bengaluru 560058');

  const longDate = (dAgo: number) =>
    new Date(Date.now() - dAgo * 864e5).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  const apptFields = (p: Contact, ctc: string, ctcW: string, join: string) => ({
    issue_date: longDate(12),
    name: p.name,
    address: p.address,
    designation: p.designation,
    company: s.company,
    joining_date: join,
    ctc,
    ctc_words: ctcW,
    probation_months: '6',
    notice_days: '60',
    work_location: s.address,
  });
  const offerFields = (p: Contact, ctc: string, join: string, till: string) => ({
    issue_date: longDate(5),
    name: p.name,
    designation: p.designation,
    company: s.company,
    ctc,
    joining_date: join,
    work_location: s.address,
    reporting_to: s.signerName,
    offer_valid_till: till,
  });
  const ndaFields = (p: Contact, purpose: string) => ({
    issue_date: longDate(9),
    company: s.company,
    company_address: s.address,
    name: p.name,
    vendor_entity: p.designation,
    address: p.address,
    purpose,
  });

  const envelopes: Envelope[] = [];
  envelopes.push(
    await demoEnv({
      tpl: 'tpl_appt',
      p: p1,
      status: 'completed',
      sealed: true,
      created: agoISO(12),
      updated: agoISO(10),
      fields: apptFields(p1, '14,40,000', 'Rupees Fourteen Lakh Forty Thousand only', '01 August 2026'),
      signature: { mode: 'draw', dataURL: scribbleSig(41), at: agoISO(11, 3), hash: '' },
      counter: { mode: 'typed', text: s.signerName, at: agoISO(10, 6), hash: '' },
      events: [
        { type: 'created', label: `Envelope drafted by ${s.signerName} (admin)`, at: agoISO(12), ua: UA_DESK },
        { type: 'sent', label: `Sent to ${p1.name} <${p1.email}> · valid 7 days · document fingerprint sealed`, at: agoISO(12), ua: UA_DESK },
        { type: 'viewed', label: 'Document opened by signer (access code entered)', at: agoISO(11, 5), ua: UA_MOBILE },
        { type: 'consent', label: 'Consent declaration accepted by signer', at: agoISO(11, 4), ua: UA_MOBILE },
        { type: 'signed', label: `Digitally signed by ${p1.name} (drawn signature)`, at: agoISO(11, 3), ua: UA_MOBILE },
        { type: 'countersigned', label: `Countersigned by ${s.signerName}, ${s.signerTitle}`, at: agoISO(10, 6), ua: UA_DESK },
        { type: 'completed', label: 'Envelope completed · final PDF available', at: agoISO(10, 6), ua: UA_DESK },
      ],
    }),
  );
  envelopes.push(
    await demoEnv({
      tpl: 'tpl_nda',
      p: p5,
      status: 'completed',
      sealed: true,
      created: agoISO(8),
      updated: agoISO(7, 20),
      fields: ndaFields(p5, 'CNC prototyping and small-batch fabrication for consumer appliance programs'),
      signature: { mode: 'upload', dataURL: scribbleSig(77), at: agoISO(7, 22), hash: '' },
      counter: { mode: 'draw', dataURL: scribbleSig(13), at: agoISO(7, 20), hash: '' },
      events: [
        { type: 'created', label: `Envelope drafted by ${s.signerName} (admin)`, at: agoISO(8), ua: UA_DESK },
        { type: 'sent', label: `Sent to ${p5.name} <${p5.email}> · valid 14 days · document fingerprint sealed`, at: agoISO(8), ua: UA_DESK },
        { type: 'viewed', label: 'Document opened by signer (access code entered)', at: agoISO(7, 23), ua: UA_MOBILE },
        { type: 'consent', label: 'Consent declaration accepted by signer', at: agoISO(7, 22), ua: UA_MOBILE },
        { type: 'signed', label: `Digitally signed by ${p5.name} (uploaded image signature)`, at: agoISO(7, 22), ua: UA_MOBILE },
        { type: 'countersigned', label: `Countersigned by ${s.signerName}, ${s.signerTitle}`, at: agoISO(7, 20), ua: UA_DESK },
        { type: 'completed', label: 'Envelope completed · final PDF available', at: agoISO(7, 20), ua: UA_DESK },
      ],
    }),
  );
  envelopes.push(
    await demoEnv({
      tpl: 'tpl_offer',
      p: p2,
      status: 'signed',
      sealed: true,
      created: agoISO(3),
      updated: agoISO(1, 2),
      expiresAt: addDays(4),
      fields: offerFields(p2, '11,00,000', '15 August 2026', '25 July 2026'),
      signature: { mode: 'draw', dataURL: scribbleSig(58), at: agoISO(1, 2), hash: '' },
      events: [
        { type: 'created', label: `Envelope drafted by ${s.signerName} (admin)`, at: agoISO(3), ua: UA_DESK },
        { type: 'sent', label: `Sent to ${p2.name} <${p2.email}> · valid 7 days · document fingerprint sealed`, at: agoISO(3), ua: UA_DESK },
        { type: 'viewed', label: 'Document opened by signer (access code entered)', at: agoISO(1, 3), ua: UA_MOBILE },
        { type: 'consent', label: 'Consent declaration accepted by signer', at: agoISO(1, 2), ua: UA_MOBILE },
        { type: 'signed', label: `Digitally signed by ${p2.name} (drawn signature)`, at: agoISO(1, 2), ua: UA_MOBILE },
      ],
    }),
  );
  envelopes.push(
    await demoEnv({
      tpl: 'tpl_nda',
      p: p3,
      status: 'sent',
      sealed: true,
      created: agoISO(5),
      updated: agoISO(4),
      expiresAt: addDays(9),
      reminders: 1,
      token: 'DEMOSTALE01',
      fields: ndaFields(p3, 'tooling and injection-mould development for the LIVO wearable program'),
      events: [
        { type: 'created', label: `Envelope drafted by ${s.signerName} (admin)`, at: agoISO(5), ua: UA_DESK },
        { type: 'sent', label: `Sent to ${p3.name} <${p3.email}> · valid 14 days · document fingerprint sealed`, at: agoISO(5), ua: UA_DESK },
        { type: 'reminder', label: `Reminder #1 sent to ${p3.name}`, at: agoISO(4), ua: UA_DESK },
      ],
    }),
  );
  envelopes.push(
    await demoEnv({
      tpl: 'tpl_offer',
      p: p4,
      status: 'sent',
      sealed: true,
      created: agoISO(1, 4),
      updated: agoISO(0, 18),
      expiresAt: addDays(6),
      token: 'DEMOFRESH01',
      fields: offerFields(p4, '9,60,000', '01 September 2026', '28 July 2026'),
      events: [
        { type: 'created', label: `Envelope drafted by ${s.signerName} (admin)`, at: agoISO(1, 4), ua: UA_DESK },
        { type: 'sent', label: `Sent to ${p4.name} <${p4.email}> · valid 7 days · document fingerprint sealed`, at: agoISO(1, 4), ua: UA_DESK },
        { type: 'viewed', label: 'Document opened by signer (access code entered)', at: agoISO(0, 18), ua: UA_MOBILE },
      ],
    }),
  );
  envelopes.push(
    await demoEnv({
      tpl: 'tpl_nda',
      p: p3,
      status: 'sent',
      sealed: true,
      created: agoISO(10),
      updated: agoISO(10),
      expiresAt: agoISO(7),
      token: 'DEMOEXP001',
      fields: ndaFields(p3, 'supplier qualification for sheet-metal enclosures'),
      events: [
        { type: 'created', label: `Envelope drafted by ${s.signerName} (admin)`, at: agoISO(10), ua: UA_DESK },
        { type: 'sent', label: `Sent to ${p3.name} <${p3.email}> · valid 3 days · document fingerprint sealed`, at: agoISO(10), ua: UA_DESK },
      ],
    }),
  );
  envelopes.push(
    await demoEnv({
      tpl: 'tpl_appt',
      p: p2,
      status: 'declined',
      sealed: true,
      created: agoISO(15),
      updated: agoISO(13),
      fields: apptFields(p2, '10,80,000', 'Rupees Ten Lakh Eighty Thousand only', '15 July 2026'),
      events: [
        { type: 'created', label: `Envelope drafted by ${s.signerName} (admin)`, at: agoISO(15), ua: UA_DESK },
        { type: 'sent', label: `Sent to ${p2.name} <${p2.email}> · valid 7 days · document fingerprint sealed`, at: agoISO(15), ua: UA_DESK },
        { type: 'viewed', label: 'Document opened by signer (access code entered)', at: agoISO(14), ua: UA_MOBILE },
        {
          type: 'declined',
          label: `Declined by ${p2.name}. Reason: "Clause 2 shows a 60-day notice period but we had agreed 30 days during discussions. Please revise and resend."`,
          at: agoISO(13),
          ua: UA_MOBILE,
        },
      ],
    }),
  );
  envelopes.push(
    await demoEnv({
      tpl: 'tpl_appt',
      p: p4,
      status: 'draft',
      sealed: false,
      created: agoISO(0, 3),
      updated: agoISO(0, 3),
      fields: apptFields(p4, '9,60,000', 'Rupees Nine Lakh Sixty Thousand only', '01 September 2026'),
      events: [{ type: 'created', label: `Envelope drafted by ${s.signerName} (admin)`, at: agoISO(0, 3), ua: UA_DESK }],
    }),
  );

  mutate((d) => {
    d.people = db.people;
    d.envelopes = d.envelopes.concat(envelopes);
  });
}
