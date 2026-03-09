import { LoadingState } from '../types';

interface Props {
  state: LoadingState;
}

export default function LoadingScreen({ state }: Props) {
  const isError = state.status === 'error';

  return (
    <div className="max-w-2xl mx-auto mt-12 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {isError ? 'Startup Error' : 'Loading Data…'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {isError
            ? 'The application could not initialise.'
            : 'The Land Registry dataset is being processed. This only happens once.'}
        </p>
      </div>

      <div className="card space-y-4">
        {/* Progress bar */}
        {!isError && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{state.message}</span>
              <span>{state.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-lr-green rounded-full transition-all duration-500"
                style={{ width: `${state.progress}%` }}
              />
            </div>
            {state.rowsProcessed > 0 && (
              <p className="text-xs text-gray-400 mt-1 text-right">
                {state.rowsProcessed.toLocaleString()} rows processed
              </p>
            )}
          </div>
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

        {!isError && state.status === 'loading' && (
          <p className="text-xs text-gray-400 text-center">
            First-time import can take several minutes for the full dataset (30M+ records).
            Subsequent starts will be instant.
          </p>
        )}
      </div>
    </div>
  );
}
