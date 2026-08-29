import type { Envelope } from '../types/envelope';
import type { Settings } from '../types/settings';

function open(email: string, subject: string, body: string): void {
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

/** Open the prepared "here is your access code" email draft. */
export function openSendMail(e: Envelope, s: Settings): void {
  const subject = `Action required: ${e.title} — sign digitally`;
  const body =
    `Dear ${e.signerName},\n\n` +
    `Your document "${e.templateName}" from ${s.company} is ready for digital signature.\n\n` +
    `1. Open the IUOVA Sign app\n` +
    `2. Go to "Signer portal"\n` +
    `3. Enter your access code: ${e.token}\n\n` +
    `Review the document, tick the consent declaration and sign digitally. No printout needed.\n\n` +
    `Regards,\n${s.signerName}\n${s.signerTitle}, ${s.company}`;
  open(e.signerEmail, subject, body);
}

/** Open a "gentle reminder" email draft for a stale envelope. */
export function openReminderMail(e: Envelope, s: Settings): void {
  const subject = `Reminder: ${e.title} — awaiting your digital signature`;
  const body =
    `Dear ${e.signerName},\n\n` +
    `A gentle reminder that your document "${e.templateName}" from ${s.company} is awaiting your digital signature.\n\n` +
    `Access code: ${e.token}${e.expiresAt ? `\nValid until: ${new Date(e.expiresAt).toLocaleString('en-IN')}` : ''}\n\n` +
    `Open the IUOVA Sign app → Signer portal → enter the code → review and sign. Takes under two minutes.\n\n` +
    `Regards,\n${s.signerName}\n${s.company}`;
  open(e.signerEmail, subject, body);
}
