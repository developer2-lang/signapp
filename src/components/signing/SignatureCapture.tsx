import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { SignaturePad } from './SignaturePad';
import { compressImage } from '../../lib/utils';
import { pushToast } from '../../lib/toast';
import {
  uploadSignatureImage,
  type SignatureInput,
} from '../../services/signatures';

export interface SignatureCaptureHandle {
  getInput: () => SignatureInput | null;
}

export interface SignatureCaptureProps {
  defaultName: string;
  /**
   * When provided (the countersign flow), the Upload tab uploads the chosen
   * image to the private "signature" Supabase bucket and persists metadata.
   * If omitted (the client sign flow), the previous compress-to-dataURL
   * behaviour is kept unchanged.
   */
  envelopeId?: string;
  /** Authenticated user id when available; falls back to a generated UUID. */
  userId?: string | null;
  /** Reports an in-flight Storage upload so the caller can disable buttons. */
  onBusy?: (busy: boolean) => void;
}

/**
 * Upload tab. Two behaviours, selected by whether an envelopeId is supplied:
 *  - Countersign (envelopeId set): validate -> upload to Storage -> save
 *    metadata. Preview comes from a local object URL so it works without a
 *    public bucket or signed URL.
 *  - Client sign (no envelopeId): legacy compress-to-dataURL (unchanged).
 */
function UploadArea({
  envelopeId,
  userId,
  onBusy,
  onLoaded,
}: {
  envelopeId?: string;
  userId?: string | null;
  onBusy?: (b: boolean) => void;
  onLoaded: (d: string | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const notifyBusy = (b: boolean) => {
    setBusy(b);
    onBusy?.(b);
  };

  const onFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    setError(null);

    if (!envelopeId) {
      // Legacy client-sign path: compress to a data URL only (no Storage).
      try {
        const d = await compressImage(f, 600);
        setPreview(d);
        onLoaded(d);
      } catch {
        pushToast('Could not read image — use PNG or JPG');
        onLoaded(null);
      }
      ev.target.value = '';
      return;
    }

    // Countersign path: validate, then persist to private Storage.
    const objectUrl = URL.createObjectURL(f);
    setPreview(objectUrl);
    notifyBusy(true);
    try {
      const { path } = await uploadSignatureImage(f, envelopeId, userId);
      onLoaded(path); // getInput uses the Storage path (no base64 in DB)
    } catch (err) {
      console.error('[SignatureCapture] upload failed', err);
      setError(err instanceof Error ? err.message : 'Could not upload signature');
      setPreview(null);
      onLoaded(null);
    } finally {
      notifyBusy(false);
      ev.target.value = '';
    }
  };

  const clear = () => {
    setPreview(null);
    setError(null);
    onLoaded(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div className="up-drop">
        {envelopeId
          ? 'Upload a PNG or JPG signature scan (max 2 MB). It is stored privately and attached to this envelope.'
          : 'Upload a photo/scan of your signature (PNG or JPG, ideally on white paper).'}
        <br />
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          style={{ marginTop: 10, border: 'none', padding: 0 }}
          onChange={onFile}
          disabled={busy}
        />
      </div>
      {error && <div className="field-error" style={{ color: '#b3261e' }}>{error}</div>}
      <div className="sig-upload-preview">
        {preview ? (
          <>
            <img src={preview} alt="uploaded signature" />
            <button
              type="button"
              className="btn ghost sm"
              style={{ marginTop: 8 }}
              onClick={clear}
              disabled={busy}
            >
              Clear
            </button>
          </>
        ) : busy ? (
          <span className="muted">Uploading…</span>
        ) : (
          <span className="muted">No image selected yet</span>
        )}
      </div>
    </div>
  );
}

export const SignatureCapture = forwardRef<SignatureCaptureHandle, SignatureCaptureProps>(
  ({ defaultName, envelopeId, userId, onBusy }, ref) => {
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
        {mode === 'upload' && (
          <UploadArea envelopeId={envelopeId} userId={userId} onBusy={onBusy} onLoaded={setUpload} />
        )}
      </>
    );
  },
);
SignatureCapture.displayName = 'SignatureCapture';
