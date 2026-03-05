import { useState } from 'react';
import UploadScreen from './components/UploadScreen';
import SearchForm from './components/SearchForm';
import ResultsOverview from './components/ResultsOverview';
import OverallSummaryPanel from './components/OverallSummaryPanel';
import PropertyList from './components/PropertyList';
import PropertyDetail from './components/PropertyDetail';
import GroupTable from './components/GroupTable';
import { SearchResponse, UploadResponse, PropertyRecord, GroupByDimension } from './types';
import { exportPropertyMetrics, exportTransactions, exportGroupSummary } from './utils/export';

type AppState = 'upload' | 'ready' | 'searching' | 'results';

export default function App() {
  const [appState, setAppState] = useState<AppState>('upload');
  const [uploadInfo, setUploadInfo] = useState<UploadResponse | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<PropertyRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'properties' | 'groups'>('properties');
  const [searchError, setSearchError] = useState<string | null>(null);

  function handleUploadSuccess(info: UploadResponse) {
    setUploadInfo(info);
    setSearchResult(null);
    setSelectedProperty(null);
    setAppState('ready');
  }

  function handleReset() {
    setUploadInfo(null);
    setSearchResult(null);
    setSelectedProperty(null);
    setAppState('upload');
  }

  async function handleSearch(params: {
    query: string;
    dateFrom?: string;
    dateTo?: string;
    propertyType?: string;
    estateType?: string;
    newBuildOnly?: boolean;
    groupBy?: GroupByDimension[];
  }) {
    if (!uploadInfo) return;
    setAppState('searching');
    setSearchError(null);
    setSelectedProperty(null);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: uploadInfo.sessionId, ...params }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
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

  function handleNewSearch() {
    setSearchResult(null);
    setSelectedProperty(null);
    setAppState('ready');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-lr-dark text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">UK Property Price History Analyser</h1>
          <p className="text-lr-light text-xs mt-0.5">HM Land Registry Price Paid Data</p>
        </div>
        {appState !== 'upload' && (
          <div className="flex gap-2">
            {appState === 'results' && (
              <button className="btn-secondary text-sm" onClick={handleNewSearch}>
                New Search
              </button>
            )}
            <button
              className="text-lr-light border border-lr-light px-3 py-1.5 rounded text-sm hover:bg-lr-green transition-colors"
              onClick={handleReset}
            >
              Upload New CSV
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        {/* Upload state */}
        {appState === 'upload' && (
          <UploadScreen onSuccess={handleUploadSuccess} />
        )}

        {/* Ready / searching */}
        {(appState === 'ready' || appState === 'searching') && uploadInfo && (
          <div className="space-y-4">
            {/* Data summary banner */}
            <div className="card bg-lr-light border-lr-green">
              <div className="flex flex-wrap gap-4 text-sm text-lr-dark">
                <span><strong>{uploadInfo.uniqueProperties.toLocaleString()}</strong> properties</span>
                <span><strong>{uploadInfo.totalRows.toLocaleString()}</strong> transactions</span>
                <span><strong>{uploadInfo.uniquePostcodes.toLocaleString()}</strong> postcodes</span>
                {uploadInfo.dateRange && (
                  <span>
                    <strong>{uploadInfo.dateRange.min}</strong> – <strong>{uploadInfo.dateRange.max}</strong>
                  </span>
                )}
              </div>
            </div>

            <SearchForm
              onSearch={handleSearch}
              searching={appState === 'searching'}
              error={searchError}
            />
          </div>
        )}

        {/* Results */}
        {appState === 'results' && searchResult && (
          <div className="space-y-4">
            {/* Data summary banner */}
            {uploadInfo && (
              <div className="card bg-lr-light border-lr-green">
                <div className="flex flex-wrap gap-4 text-sm text-lr-dark">
                  <span><strong>{uploadInfo.uniqueProperties.toLocaleString()}</strong> properties loaded</span>
                  <span><strong>{uploadInfo.totalRows.toLocaleString()}</strong> total transactions</span>
                </div>
              </div>
            )}

            <ResultsOverview result={searchResult} />

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

            {/* Tabs */}
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
                      ? `Properties (${searchResult.summary.totalProperties})`
                      : `Groups (${searchResult.groups.length})`}
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'properties' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1">
                  <PropertyList
                    properties={searchResult.properties}
                    selectedKey={selectedProperty?.propertyKey ?? null}
                    onSelect={setSelectedProperty}
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

            {activeTab === 'groups' && (
              <GroupTable groups={searchResult.groups} />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4 text-xs text-gray-500">
        <p>
          Data: <strong>HM Land Registry Price Paid Data</strong> — Contains public sector information
          licensed under the{' '}
          <a
            href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
            target="_blank"
            rel="noreferrer"
            className="underline"
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
