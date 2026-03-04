import { useState, useCallback } from 'react';
import type { SearchRequest, SearchResponse, PropertyRecord } from './types';
import SearchForm from './components/SearchForm';
import ResultsOverview from './components/ResultsOverview';
import PropertyList from './components/PropertyList';
import PropertyDetail from './components/PropertyDetail';
import GroupTable from './components/GroupTable';
import { exportPropertyMetrics, exportTransactions, exportGroupSummary } from './utils/export';

// ── API call ──────────────────────────────────────────────────────────────────

async function searchAPI(req: SearchRequest): Promise<SearchResponse> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Server error ${res.status}`);
  }
  return res.json() as Promise<SearchResponse>;
}

// ── Tab component ─────────────────────────────────────────────────────────────

type Tab = 'properties' | 'groups';

function TabBar({ active, setActive, showGroups }: { active: Tab; setActive: (t: Tab) => void; showGroups: boolean }) {
  return (
    <div className="flex gap-1 border-b border-gray-200">
      {(['properties', 'groups'] as Tab[]).map(t => {
        if (t === 'groups' && !showGroups) return null;
        return (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              active === t
                ? 'border-lr-green text-lr-green'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t === 'properties' ? 'Properties' : 'Groups'}
          </button>
        );
      })}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<PropertyRecord | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('properties');

  const handleSearch = useCallback(async (req: SearchRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedProperty(null);
    try {
      const data = await searchAPI(req);
      setResult(data);
      if (data.groups.length > 0) setActiveTab('groups');
      else setActiveTab('properties');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectProperty = useCallback((prop: PropertyRecord) => {
    setSelectedProperty(prev => prev?.addressId === prop.addressId ? null : prop);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-lr-dark text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <div>
            <h1 className="text-lg font-bold leading-tight">UK Property Price History Analyser</h1>
            <p className="text-xs text-green-200 mt-0.5">
              Powered by HM Land Registry Price Paid Data (England &amp; Wales)
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Search */}
        <SearchForm onSearch={handleSearch} loading={loading} />

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Overview stats */}
            <ResultsOverview result={result} />

            {/* Export actions */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-medium text-gray-500">Export:</span>
              <button
                className="btn-secondary text-xs py-1 px-3"
                onClick={() => exportPropertyMetrics(result.properties)}
                disabled={result.properties.length === 0}
              >
                Property metrics CSV
              </button>
              <button
                className="btn-secondary text-xs py-1 px-3"
                onClick={() => exportTransactions(result.properties)}
                disabled={result.properties.length === 0}
              >
                Transactions CSV
              </button>
              {result.groups.length > 0 && (
                <button
                  className="btn-secondary text-xs py-1 px-3"
                  onClick={() => exportGroupSummary(result.groups)}
                >
                  Group summary CSV
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="card !p-0 overflow-hidden">
              <div className="px-6 pt-4">
                <TabBar
                  active={activeTab}
                  setActive={setActiveTab}
                  showGroups={result.groups.length > 0}
                />
              </div>

              <div className="p-6">
                {activeTab === 'properties' && (
                  <PropertyList
                    properties={result.properties}
                    onSelect={handleSelectProperty}
                    selected={selectedProperty?.addressId}
                  />
                )}
                {activeTab === 'groups' && result.groups.length > 0 && (
                  <GroupTable groups={result.groups} />
                )}
              </div>
            </div>

            {/* Property detail panel */}
            {selectedProperty && (
              <PropertyDetail
                property={selectedProperty}
                onClose={() => setSelectedProperty(null)}
              />
            )}
          </>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="text-center py-16 text-gray-400">
            <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <p className="text-sm">Enter a postcode or street name above to get started.</p>
          </div>
        )}
      </main>

      {/* Footer – attribution */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Contains HM Land Registry data © Crown copyright and database right 2025.
            This data is licensed under the{' '}
            <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener noreferrer" className="underline hover:text-lr-green">
              Open Government Licence v3.0
            </a>
            . Address data is derived from Ordnance Survey/Royal Mail data. For full licensing details see{' '}
            <a href="https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads" target="_blank" rel="noopener noreferrer" className="underline hover:text-lr-green">
              GOV.UK Price Paid Data
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
