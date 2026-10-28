import { useEffect, useRef, useState } from 'react';
import { MergeProgress, MergeResult } from '../types';
import ProgressBar from './ProgressBar';

interface Props {
  onClose: () => void;
}

type Stage = 'select' | 'uploading' | 'applying' | 'done';

interface UploadProgress {
  loaded: number;
  total: number;
  startedAt: number;
}

export default function MergeUploadModal({ onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>('select');
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  const [apply, setApply] = useState<MergeProgress | null>(null);
  const [result, setResult] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPolling() {
    stopPolling();
    async function poll() {
      try {
        const res = await fetch('/api/upload/merge/status');
        const data: MergeProgress = await res.json();
        setApply(data);
        if (data.status === 'done') {
          stopPolling();
          setResult(data.result);
          setStage('done');
        } else if (data.status === 'error') {
          stopPolling();
          setError(data.error ?? 'Update failed');
          setStage('select');
        }
      } catch {
        // transient — keep polling
      }
    }
    poll();
    pollRef.current = setInterval(poll, 1000);
  }

  // Re-attach to an update that is still running (e.g. modal closed and reopened)
  useEffect(() => {
    fetch('/api/upload/merge/status')
      .then(r => r.json())
      .then((data: MergeProgress) => {
        if (data.status === 'running') {
          setApply(data);
          setStage('applying');
          startPolling();
        }
      })
      .catch(() => {});
    return () => {
      stopPolling();
      xhrRef.current?.abort();
    };
  }, []);

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv')) {
      setError('Please select a CSV file.');
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
  }

  function handleUpload() {
    if (!file) return;
    setError(null);
    setResult(null);
    setApply(null);
    setStage('uploading');
    setUpload({ loaded: 0, total: file.size, startedAt: Date.now() });

    // XMLHttpRequest rather than fetch so upload progress can be reported
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', '/api/upload/merge');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) setUpload(u => u && { ...u, loaded: e.loaded, total: e.total });
    };
    xhr.onload = () => {
      xhrRef.current = null;
      let data: { error?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status === 202) {
        setFile(null);
        setStage('applying');
        startPolling();
      } else {
        setError(data.error ?? `HTTP ${xhr.status}`);
        setStage('select');
      }
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setError('Upload failed — is the server running?');
      setStage('select');
    };
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  }

  const uploadPct = upload && upload.total > 0 ? Math.round((upload.loaded / upload.total) * 100) : 0;
  const uploadElapsed = upload ? (Date.now() - upload.startedAt) / 1000 : 0;
  const uploadEta = upload && upload.loaded > 0 && uploadElapsed >= 2
    ? ((upload.total - upload.loaded) * uploadElapsed) / upload.loaded
    : null;

  const busy = stage === 'uploading' || stage === 'applying';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Update Dataset</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Download an incremental CSV from the{' '}
            <a
              href="https://landregistry.data.gov.uk/app/ppd/ppd_data"
              target="_blank" rel="noreferrer"
              className="text-lr-green underline"
            >
              Land Registry website
            </a>{' '}
            and upload it here. New transactions are added, corrected ones are updated and withdrawn
            ones are removed. Duplicates are skipped, and the update is saved permanently.
          </p>

          {stage === 'select' && (
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragging ? 'border-lr-green bg-green-50' : 'border-gray-300 hover:border-lr-green'
              }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {file ? (
                <div className="text-sm text-gray-700">
                  <span className="font-medium">{file.name}</span>
                  <span className="text-gray-400 ml-2">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  Drag &amp; drop a CSV file, or click to browse
                </div>
              )}
            </div>
          )}

          {busy && (
            <div className="space-y-4">
              <StepRow
                n={1}
                title="Upload file"
                state={stage === 'uploading' ? 'active' : 'done'}
              >
                {stage === 'uploading' && (
                  <ProgressBar
                    label={`${(upload!.loaded / 1e6).toFixed(1)} of ${(upload!.total / 1e6).toFixed(1)} MB`}
                    progress={uploadPct}
                    elapsedSec={uploadElapsed}
                    etaSeconds={uploadEta}
                  />
                )}
              </StepRow>
              <StepRow
                n={2}
                title="Apply to database"
                state={stage === 'applying' ? 'active' : 'pending'}
              >
                {stage === 'applying' && apply && (
                  <ProgressBar
                    label={`${(apply.bytesProcessed / 1e6).toFixed(1)} of ${(apply.totalBytes / 1e6).toFixed(1)} MB processed`}
                    progress={apply.progress}
                    elapsedSec={apply.elapsedSec}
                    etaSeconds={apply.etaSeconds}
                    detail={`${apply.rowsProcessed.toLocaleString()} rows`}
                  />
                )}
              </StepRow>
              {stage === 'applying' && (
                <p className="text-xs text-gray-400">
                  You can close this window. The update continues in the background, and searches still work.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
              {error}
            </div>
          )}

          {result && (
            <div className="bg-green-50 border border-green-200 rounded p-4 space-y-1 text-sm">
              <div className="font-semibold text-green-800">
                Update complete{apply ? ` in ${apply.elapsedSec}s` : ''}
              </div>
              <div className="text-green-700">
                <span className="font-medium">{result.added.toLocaleString()}</span> new transactions added
              </div>
              {result.updated > 0 && (
                <div className="text-green-700">
                  {result.updated.toLocaleString()} transactions corrected
                </div>
              )}
              {result.deleted > 0 && (
                <div className="text-green-700">
                  {result.deleted.toLocaleString()} withdrawn transactions removed
                </div>
              )}
              {result.duplicates > 0 && (
                <div className="text-gray-600">
                  {result.duplicates.toLocaleString()} duplicates skipped
                </div>
              )}
              {result.skipped > 0 && (
                <div className="text-gray-500">
                  {result.skipped.toLocaleString()} invalid rows skipped
                </div>
              )}
              {result.dateRange && (
                <div className="text-gray-600 pt-1">
                  New data covers {result.dateRange.min} to {result.dateRange.max}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button className="btn-secondary text-sm" onClick={onClose}>
            {stage === 'done' || stage === 'applying' ? 'Close' : 'Cancel'}
          </button>
          {stage !== 'done' && stage !== 'applying' && (
            <button
              className="btn-primary text-sm"
              disabled={!file || stage === 'uploading'}
              onClick={handleUpload}
            >
              {stage === 'uploading' ? 'Uploading…' : 'Upload & Merge'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepRow({ n, title, state, children }: {
  n: number;
  title: string;
  state: 'pending' | 'active' | 'done';
  children?: React.ReactNode;
}) {
  const badge =
    state === 'done'   ? 'bg-lr-green text-white' :
    state === 'active' ? 'border-2 border-lr-green text-lr-green' :
                         'border-2 border-gray-300 text-gray-400';
  return (
    <div className="flex gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${badge}`}>
        {state === 'done' ? '✓' : n}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className={`text-sm font-medium ${state === 'pending' ? 'text-gray-400' : 'text-gray-800'}`}>{title}</div>
        {children}
      </div>
    </div>
  );
}
