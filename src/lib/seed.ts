import type { AppDB } from '../types/db';
import type { Settings } from '../types/settings';
import type { Template } from '../types/template';

export const SEED_TEMPLATES: Template[] = [
  {
    id: 'tpl_appt',
    name: 'Appointment Letter',
    kind: 'employee',
    letterhead: null,
    body: `Date: {{issue_date}}

To,
{{name}}
{{address}}

Subject: Letter of Appointment — {{designation}}

Dear {{name}},

With reference to your application and subsequent discussions, we are pleased to appoint you as {{designation}} at {{company}}, effective {{joining_date}}, on the following terms:

1. COMPENSATION. Your annual cost to company (CTC) will be INR {{ctc}} ({{ctc_words}}), structured as per the compensation annexure shared with you.

2. PROBATION. You will be on probation for a period of {{probation_months}} months from your date of joining, during which the notice period shall be 15 days on either side. Upon confirmation, the notice period shall be {{notice_days}} days.

3. PLACE OF WORK. Your primary place of work will be our studio at {{work_location}}. You may be required to travel for client and project work.

4. CONFIDENTIALITY & IP. All designs, engineering outputs, documentation and know-how created by you in the course of employment shall be the exclusive property of {{company}}. You shall maintain strict confidentiality regarding client information and internal processes, during and after your employment.

5. GENERAL. Your employment is subject to the company's policies as amended from time to time, and to satisfactory verification of your credentials and documents.

Please signify your acceptance by digitally signing this letter.

We look forward to having you on the team.

For {{company}}`,
  },
  {
    id: 'tpl_nda',
    name: 'Vendor NDA (Mutual)',
    kind: 'vendor',
    letterhead: null,
    body: `MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is made on {{issue_date}} between:

(1) {{company}}, having its office at {{company_address}} ("IUOVA"); and
(2) {{name}}, {{vendor_entity}}, having its office at {{address}} ("Counterparty").

1. PURPOSE. The parties wish to explore and/or execute a business engagement relating to {{purpose}} (the "Purpose") and may disclose Confidential Information to each other.

2. CONFIDENTIAL INFORMATION means all non-public information disclosed by either party, including designs, CAD data, prototypes, specifications, costing, supplier details, business plans and client identities, whether marked confidential or not.

3. OBLIGATIONS. Each party shall (a) use Confidential Information solely for the Purpose; (b) protect it with at least the same care as its own confidential information and no less than reasonable care; (c) not disclose it to third parties except to personnel with a need to know who are bound by equivalent obligations.

4. EXCLUSIONS. Obligations do not apply to information that is publicly available without breach, independently developed, rightfully received from a third party, or required to be disclosed by law (with prompt notice where permitted).

5. IP. No licence or ownership of any intellectual property is granted under this Agreement. All Background IP remains with its owner.

6. TERM. This Agreement is effective from the date above and the confidentiality obligations shall survive for three (3) years from the date of last disclosure.

7. GOVERNING LAW & JURISDICTION. This Agreement is governed by the laws of India. Courts at Mumbai shall have exclusive jurisdiction.

Agreed and accepted by digital signature below.`,
  },
  {
    id: 'tpl_offer',
    name: 'Offer Letter',
    kind: 'employee',
    letterhead: null,
    body: `Date: {{issue_date}}

Dear {{name}},

Further to our discussions, {{company}} is pleased to extend to you an offer for the position of {{designation}}.

• Annual CTC: INR {{ctc}}
• Proposed date of joining: {{joining_date}}
• Location: {{work_location}}
• Reporting to: {{reporting_to}}

This offer is valid until {{offer_valid_till}} and is contingent on document verification and reference checks. A detailed appointment letter will be issued on your date of joining.

Please confirm your acceptance by digitally signing this letter.

Warm regards,
For {{company}}`,
  },
];

export const DEFAULT_SETTINGS: Settings = {
  signerName: 'Vatsal',
  signerTitle: 'Founder & Managing Director',
  company: 'IUOVA Design Company',
  address: 'Mumbai, Maharashtra, India',
  letterhead: null,
  pinHash: null,
};

export const DEFAULTS: AppDB = {
  settings: structuredClone(DEFAULT_SETTINGS),
  templates: structuredClone(SEED_TEMPLATES),
  people: [],
  envelopes: [],
};
