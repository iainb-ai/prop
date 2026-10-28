import { LoadingState } from '../types';
import ProgressBar from './ProgressBar';

interface Props {
  state: LoadingState;
}

export default function LoadingScreen({ state }: Props) {
  const isError = state.status === 'error';
  const isImporting = state.mode === 'importing';

  return (
    <div className="max-w-2xl mx-auto mt-12 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {isError ? 'Startup Error' : isImporting ? 'Building Database…' : 'Opening Database…'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {isError
            ? 'The application could not initialise.'
            : isImporting
              ? 'The Land Registry dataset is being imported. This only happens once.'
              : 'Loading the saved dataset, including any updates you have applied.'}
        </p>
      </div>

      <div className="card space-y-4">
        {!isError && (
          <ProgressBar
            label={state.message}
            progress={state.progress}
            indeterminate={state.indeterminate}
            elapsedSec={state.phaseElapsedSec}
            etaSeconds={state.etaSeconds}
            detail={state.rowsProcessed > 0 ? `${state.rowsProcessed.toLocaleString()} rows` : undefined}
          />
        )}

        {/* Log */}
        <div className={`rounded p-3 text-xs font-mono space-y-0.5 max-h-64 overflow-y-auto ${isError ? 'bg-red-50 border border-red-200' : 'bg-gray-900'}`}>
          {state.log.length === 0 && !isError && (
            <div className="text-gray-500">Initialising…</div>
          )}
          {state.log.map((line, i) => (
            <div
              key={i}
              className={
                isError ? 'text-red-700' :
                line.startsWith('⚠') ? 'text-yellow-400' :
                line.startsWith('✗') ? 'text-red-400' :
                'text-green-400'
              }
            >
              {line}
            </div>
          ))}
          {!isError && state.status === 'loading' && (
            <div className="text-gray-500 animate-pulse">▌</div>
          )}
        </div>

        {isError && (
          <div className="text-sm text-red-600">
            {state.error ?? 'Unknown error. Check that pp-fulldata.csv is in the project root.'}
          </div>
        )}

        {!isError && isImporting && (
          <p className="text-xs text-gray-400 text-center">
            First-time import can take several minutes for the full dataset (30M+ records).
            Subsequent starts will be much faster.
          </p>
        )}
      </div>
    </div>
  );
}
