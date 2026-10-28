import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import LoadingScreen from './components/LoadingScreen';
import SearchForm from './components/SearchForm';
import ResultsOverview from './components/ResultsOverview';
import OverallSummaryPanel from './components/OverallSummaryPanel';
import MarketTrendsPanel from './components/MarketTrendsPanel';
import PropertyList from './components/PropertyList';
import PropertyDetail from './components/PropertyDetail';
import GroupTable from './components/GroupTable';
import MergeUploadModal from './components/MergeUploadModal';
const RentVsBuyPage = lazy(() => import('./components/RentVsBuyPage'));
import { LoadingState, SearchResponse, PropertyRecord, GroupByDimension } from './types';
import { exportPropertyMetrics, exportTransactions, exportGroupSummary } from './utils/export';

type AppState = 'loading' | 'ready' | 'searching' | 'results';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [loadingState, setLoadingState] = useState<LoadingState>({
    status: 'idle', progress: 0, rowsProcessed: 0, message: 'Connecting...', log: [],
  });
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<PropertyRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'properties' | 'groups'>('properties');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchElapsed, setSearchElapsed] = useState(0);
  const [rentVsBuyOpen, setRentVsBuyOpen] = useState(false);
  const [rentVsBuyCagr, setRentVsBuyCagr] = useState<number | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll /api/status until DB is ready
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/status');
        const data: LoadingState = await res.json();
        setLoadingState(data);
        if (data.status === 'ready') {
          setAppState('ready');
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // backend not yet up — keep polling
      }
    }
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Elapsed-time counter while a search is in flight
  useEffect(() => {
    if (appState === 'searching') {
      setSearchElapsed(0);
      timerRef.current = setInterval(() => setSearchElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [appState]);

  async function handleSearch(params: {
    query: string;
    dateFrom?: string;
    dateTo?: string;
    propertyType?: string;
    estateType?: string;
    newBuildOnly?: boolean;
    groupBy?: GroupByDimension[];
  }) {
    setAppState('searching');
    setSearchError(null);
    setSelectedProperty(null);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error: string }).error ?? `HTTP ${res.status}`);
      }
      const data: SearchResponse = await res.json();
      setSearchResult(data);
      setActiveTab('properties');
      setAppState('results');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setAppState('ready');
    }
  }

  async function handleSelectProperty(record: PropertyRecord) {
    setSelectedProperty(record);
    // If we only have the trimmed (last-tx-only) record, fetch full transaction history
    if (record.transactions.length < (record.metrics?.transactionCount ?? 2)) {
      try {
        const res = await fetch(`/api/property?key=${encodeURIComponent(record.propertyKey)}`);
        if (res.ok) {
          const full: PropertyRecord = await res.json();
          setSelectedProperty(full);
        }
      } catch {
        // keep trimmed record on failure
      }
    }
  }

  function handleNewSearch() {
    setSearchResult(null);
    setSelectedProperty(null);
    setAppState('ready');
  }

  function handleCompare(cagr: number) {
    setRentVsBuyCagr(cagr);
    setRentVsBuyOpen(true);
  }

  function handleCloseRentVsBuy() {
    setRentVsBuyOpen(false);
    setRentVsBuyCagr(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-lr-dark text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">UK Property Price History Analyser</h1>
          <p className="text-lr-light text-xs mt-0.5">HM Land Registry Price Paid Data</p>
        </div>
        {(appState === 'ready' || appState === 'results' || appState === 'searching') && (
          <div className="flex gap-2">
            {appState === 'results' && (
              <button className="btn-secondary text-sm" onClick={handleNewSearch}>
                New Search
              </button>
            )}
            <button className="btn-secondary text-sm" onClick={() => setMergeOpen(true)}>
              Update Dataset
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">

        {/* Loading / error screen */}
        {(appState === 'loading' || loadingState.status === 'error') && (
          <LoadingScreen state={loadingState} />
        )}

        {/* Search form */}
        {(appState === 'ready' || appState === 'searching') && (
          <SearchForm
            onSearch={handleSearch}
            searching={appState === 'searching'}
            elapsed={searchElapsed}
            error={searchError}
          />
        )}

        {/* Results */}
        {appState === 'results' && searchResult && (
          <div className="space-y-4">

            <ResultsOverview result={searchResult} />

            <MarketTrendsPanel trends={searchResult.marketTrends} onCompare={handleCompare} />

            <OverallSummaryPanel summary={searchResult.overallSummary} />

            {/* Export buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary text-sm"
                onClick={() => exportPropertyMetrics(searchResult.properties)}
                disabled={searchResult.properties.length === 0}
              >
                Export Property Metrics
              </button>
              <button
                className="btn-secondary text-sm"
                onClick={() => exportTransactions(searchResult.properties)}
                disabled={searchResult.properties.length === 0}
              >
                Export Transactions
              </button>
              {searchResult.groups.length > 0 && (
                <button
                  className="btn-secondary text-sm"
                  onClick={() => exportGroupSummary(searchResult.groups)}
                >
                  Export Group Summary
                </button>
              )}
            </div>

            {/* Tabs — only shown when grouping is active */}
            {searchResult.groups.length > 0 && (
              <div className="flex border-b border-gray-200">
                {(['properties', 'groups'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-lr-green text-lr-green'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab === 'properties'
                      ? `Properties (${searchResult.summary.totalProperties.toLocaleString()})`
                      : `Groups (${searchResult.groups.length})`}
                  </button>
                ))}
              </div>
            )}

            {/* Cap notice */}
            {searchResult.summary.totalProperties > searchResult.properties.length && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Showing {searchResult.properties.length.toLocaleString()} of{' '}
                {searchResult.summary.totalProperties.toLocaleString()} properties (top by transaction count).
                Market trends and summary metrics cover the full result set.
              </div>
            )}

            {(activeTab === 'properties' || searchResult.groups.length === 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1">
                  <PropertyList
                    properties={searchResult.properties}
                    selectedKey={selectedProperty?.propertyKey ?? null}
                    onSelect={handleSelectProperty}
                  />
                </div>
                <div className="lg:col-span-2">
                  {selectedProperty ? (
                    <PropertyDetail
                      record={selectedProperty}
                      onClose={() => setSelectedProperty(null)}
                    />
                  ) : (
                    <div className="card flex items-center justify-center h-48 text-gray-400 text-sm">
                      Select a property from the list to view details
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'groups' && searchResult.groups.length > 0 && (
              <GroupTable groups={searchResult.groups} />
            )}
          </div>
        )}
      </main>

      {mergeOpen && (
        <MergeUploadModal onClose={() => setMergeOpen(false)} />
      )}

      {rentVsBuyOpen && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
          <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500">Loading…</div>}>
            <RentVsBuyPage
              initialPropertyGrowth={rentVsBuyCagr}
              onClose={handleCloseRentVsBuy}
            />
          </Suspense>
        </div>
      )}

      <footer className="bg-white border-t border-gray-200 px-6 py-4 text-xs text-gray-500">
        <p>
          Data: <strong>HM Land Registry Price Paid Data</strong> — Contains public sector information
          licensed under the{' '}
          <a
            href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
            target="_blank" rel="noreferrer" className="underline"
          >
            Open Government Licence v3.0
          </a>
          . Crown copyright and database rights 2024 Land Registry.
          Address data derived from AddressBase® Premium — Royal Mail/Ordnance Survey copyright.
        </p>
      </footer>
    </div>
  );
}
