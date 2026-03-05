import { useState, useCallback, useRef } from 'react';
import { UploadResponse } from '../types';

interface Props {
  onSuccess: (info: UploadResponse) => void;
}

export default function UploadScreen({ onSuccess }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file.');
      return;
    }
    setError(null);
    setUploading(true);
    setProcessingLog(['Uploading file...']);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setProcessingLog(data.processingLog ?? []);
      setTimeout(() => onSuccess(data as UploadResponse), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
      setProcessingLog([]);
    }
  }, [onSuccess]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="max-w-2xl mx-auto space-y-6 mt-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Get Started</h2>
        <p className="mt-1 text-gray-500 text-sm">
          Download your data from HM Land Registry and upload it here to analyse property price history.
        </p>
      </div>

      {/* Step 1 */}
      <div className="card">
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-lr-green text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">Go to the Land Registry search tool</h3>
            <p className="text-sm text-gray-600 mt-1">
              Visit the Price Paid Data search page and enter your search criteria — postcode, date range,
              property type, etc.
            </p>
            <a
              href="https://landregistry.data.gov.uk/app/ppd/"
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-2 btn-primary text-sm"
            >
              Open Land Registry Search ↗
            </a>
          </div>
        </div>
      </div>

      {/* Step 2 */}
      <div className="card">
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-lr-green text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">Download your results as CSV</h3>
            <p className="text-sm text-gray-600 mt-1">
              After running a search, click <strong>"Get all results as CSV with headers"</strong> on the
              results page. This will download a file containing all matching transactions.
            </p>
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-600">
              <strong>Tip:</strong> For a full postcode like SW11 1AD, all results are usually included.
              For large areas (e.g. a district like SW11), you may want to filter by date range or
              property type to keep the file manageable.
            </div>
          </div>
        </div>
      </div>

      {/* Step 3 — Upload */}
      <div className="card">
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-lr-green text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">Upload your CSV here</h3>
            <p className="text-sm text-gray-600 mt-1 mb-3">
              Upload the downloaded CSV. Data is processed locally — nothing is sent to any external server.
            </p>

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-lr-green bg-lr-light'
                  : 'border-gray-300 hover:border-lr-green hover:bg-gray-50'
              } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onInputChange}
              />
              {uploading ? (
                <div className="space-y-2">
                  <div className="animate-spin w-8 h-8 border-2 border-lr-green border-t-transparent rounded-full mx-auto" />
                  <p className="text-sm text-gray-600">Processing...</p>
                </div>
              ) : (
                <>
                  <div className="text-4xl mb-2">📄</div>
                  <p className="text-sm font-medium text-gray-700">
                    Drag & drop your CSV here, or click to browse
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Supports files up to 100 MB (100,000+ records)</p>
                </>
              )}
            </div>

            {/* Processing log */}
            {processingLog.length > 0 && (
              <div className="mt-3 bg-gray-900 rounded p-3 text-xs font-mono space-y-0.5 max-h-40 overflow-y-auto">
                {processingLog.map((line, i) => (
                  <div key={i} className={line.startsWith('⚠') ? 'text-yellow-400' : 'text-green-400'}>
                    {line}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
