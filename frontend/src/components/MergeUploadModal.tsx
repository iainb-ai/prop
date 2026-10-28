import { useRef, useState } from 'react';

interface MergeResult {
  added: number;
  duplicates: number;
  skipped: number;
  dateRange: { min: string; max: string } | null;
}

interface Props {
  onClose: () => void;
}

export default function MergeUploadModal({ onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv')) {
      setError('Please select a CSV file.');
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload/merge', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as MergeResult);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

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
            and upload it here. New transactions will be added; duplicates are skipped automatically.
          </p>

          {!result && (
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

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
              {error}
            </div>
          )}

          {result && (
            <div className="bg-green-50 border border-green-200 rounded p-4 space-y-1 text-sm">
              <div className="font-semibold text-green-800">Update complete</div>
              <div className="text-green-700">
                <span className="font-medium">{result.added.toLocaleString()}</span> new transactions added
              </div>
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
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              className="btn-primary text-sm"
              disabled={!file || uploading}
              onClick={handleUpload}
            >
              {uploading ? 'Uploading…' : 'Upload & Merge'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
