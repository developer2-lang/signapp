import { forwardRef, useImperativeHandle, useState } from 'react';
import { SignaturePad } from './SignaturePad';
import { compressImage } from '../../lib/utils';
import { pushToast } from '../../lib/toast';
import type { SignatureInput } from '../../services/signatures';

export interface SignatureCaptureHandle {
  getInput: () => SignatureInput | null;
}

function UploadArea({ onLoaded }: { onLoaded: (d: string | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const onFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const d = await compressImage(f, 600);
      setPreview(d);
      onLoaded(d);
    } catch {
      pushToast('Could not read image — use PNG or JPG');
      onLoaded(null);
    }
    ev.target.value = '';
  };
  return (
    <div>
      <div className="up-drop">
        Upload a photo/scan of your signature (PNG or JPG, ideally on white paper).
        <br />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ marginTop: 10, border: 'none', padding: 0 }}
          onChange={onFile}
        />
      </div>
      <div className="sig-upload-preview">
        {preview ? (
          <img src={preview} alt="uploaded signature" />
        ) : (
          <span className="muted">No image selected yet</span>
        )}
      </div>
    </div>
  );
}

export const SignatureCapture = forwardRef<SignatureCaptureHandle, { defaultName: string }>(
  ({ defaultName }, ref) => {
    const [mode, setMode] = useState<'draw' | 'typed' | 'upload'>('draw');
    const [drawData, setDrawData] = useState<string | null>(null);
    const [typed, setTyped] = useState(defaultName);
    const [upload, setUpload] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      getInput: () => {
        if (mode === 'draw' && drawData) return { mode: 'draw', dataURL: drawData };
        if (mode === 'typed' && typed.trim()) return { mode: 'typed', text: typed.trim() };
        if (mode === 'upload' && upload) return { mode: 'upload', dataURL: upload };
        return null;
      },
    }));

    return (
      <>
        <div className="sig-tabs">
          <button className={mode === 'draw' ? 'on' : ''} onClick={() => setMode('draw')} type="button">
            ✍ Draw
          </button>
          <button className={mode === 'typed' ? 'on' : ''} onClick={() => setMode('typed')} type="button">
            ⌨ Type
          </button>
          <button
            className={mode === 'upload' ? 'on' : ''}
            onClick={() => setMode('upload')}
            type="button"
          >
            📎 Upload
          </button>
        </div>
        {mode === 'draw' && <SignaturePad onChange={setDrawData} />}
        {mode === 'typed' && (
          <>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} />
            <div className="typed-preview">{typed || ' '}</div>
          </>
        )}
        {mode === 'upload' && <UploadArea onLoaded={setUpload} />}
      </>
    );
  },
);
SignatureCapture.displayName = 'SignatureCapture';
