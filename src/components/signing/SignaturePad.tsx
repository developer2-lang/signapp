import { useEffect, useRef, useState } from 'react';

export function SignaturePad({
  onChange,
  height = 180,
}: {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#181B21';
    ctxRef.current = ctx;

    const pos = (e: MouseEvent | TouchEvent) => {
      const r = c.getBoundingClientRect();
      const p = 'touches' in e ? e.touches[0] : (e as MouseEvent);
      return { x: (p as MouseEvent).clientX - r.left, y: (p as MouseEvent).clientY - r.top };
    };
    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawing.current = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      setDirty(true);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const end = () => {
      if (!drawing.current) return;
      drawing.current = false;
      onChange(trim());
    };
    c.addEventListener('mousedown', start);
    c.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    c.addEventListener('touchstart', start as EventListener, { passive: false });
    c.addEventListener('touchmove', move as EventListener, { passive: false });
    c.addEventListener('touchend', end);

    return () => {
      c.removeEventListener('mousedown', start);
      c.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      c.removeEventListener('touchstart', start as EventListener);
      c.removeEventListener('touchmove', move as EventListener);
      c.removeEventListener('touchend', end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function trim(): string | null {
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return null;
    const w = c.width;
    const h = c.height;
    const img = ctx.getImageData(0, 0, w, h).data;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let found = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (img[(y * w + x) * 4 + 3] > 10) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return null;
    const pw = maxX - minX + 20;
    const ph = maxY - minY + 20;
    const t = document.createElement('canvas');
    t.width = pw;
    t.height = ph;
    t.getContext('2d')!.drawImage(c, minX - 10, minY - 10, pw, ph, 0, 0, pw, ph);
    return t.toDataURL('image/png');
  }

  const clear = () => {
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setDirty(false);
    onChange(null);
  };

  return (
    <div>
      <div className="sigpad-wrap">
        <canvas ref={canvasRef} className="sigpad" />
        {!dirty && <div className="sigpad-hint">sign here</div>}
      </div>
      <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={clear} type="button">
        Clear
      </button>
    </div>
  );
}
