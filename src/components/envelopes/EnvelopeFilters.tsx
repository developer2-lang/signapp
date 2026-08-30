interface EnvelopeFiltersProps {
  q: string;
  s: string;
  onQ: (v: string) => void;
  onS: (v: string) => void;
}

export function EnvelopeFilters({ q, s, onQ, onS }: EnvelopeFiltersProps) {
  return (
    <div className="filter-bar">
      <input
        placeholder="Search title, signer or email…"
        value={q}
        onChange={(e) => onQ(e.target.value)}
      />
      <select value={s} onChange={(e) => onS(e.target.value)}>
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="sent">Awaiting signer</option>
        <option value="expired">Expired</option>
        <option value="signed">Counter-signature pending</option>
        <option value="completed">Completed</option>
        <option value="declined">Declined</option>
      </select>
    </div>
  );
}
