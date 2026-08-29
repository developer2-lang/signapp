export function ConsentSection({
  name,
  checked,
  onChange,
}: {
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="consent-box">
      <label>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>
          <strong>Declaration of consent.</strong> I, {name}, confirm that I have read and understood
          this document in full, that I intend to be legally bound by it, and that I consent to
          executing it by electronic signature under Section 10A of the Information Technology Act,
          2000. I understand that my signature, the date-time, and my device details will be recorded
          in the audit trail.
        </span>
      </label>
    </div>
  );
}
