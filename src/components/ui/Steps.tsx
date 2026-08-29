export function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="steps">
      {labels.map((label, i) => {
        const state = i + 1 === current ? 'on' : i + 1 < current ? 'done' : '';
        return (
          <div className={`st ${state}`} key={i}>
            {i + 1} · {label}
          </div>
        );
      })}
    </div>
  );
}
