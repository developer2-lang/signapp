import { useToasts } from '../../lib/toast';

export function Toasts() {
  const toasts = useToasts();
  return (
    <>
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          {t.text}
        </div>
      ))}
    </>
  );
}
