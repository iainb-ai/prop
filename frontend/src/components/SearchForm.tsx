import { useState, FormEvent } from 'react';
import type { SearchRequest, PropertyTypeCode, EstateTypeCode, GroupByDimension } from '../types';

const GROUP_BY_OPTIONS: { value: GroupByDimension; label: string }[] = [
  { value: 'postcodeUnit', label: 'Postcode (full)' },
  { value: 'postcodeSector', label: 'Postcode sector' },
  { value: 'postcodeDistrict', label: 'Postcode district' },
  { value: 'propertyType', label: 'Property type' },
  { value: 'buildingOrStreet', label: 'Building / Street' },
];

interface Props {
  onSearch: (req: SearchRequest) => void;
  loading: boolean;
}

export default function SearchForm({ onSearch, loading }: Props) {
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyTypeCode | ''>('');
  const [estateType, setEstateType] = useState<EstateTypeCode | ''>('');
  const [newBuildOnly, setNewBuildOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupByDimension[]>([]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const req: SearchRequest = { query: query.trim() };
    if (dateFrom) req.dateFrom = dateFrom;
    if (dateTo) req.dateTo = dateTo;
    if (propertyType) req.propertyType = propertyType;
    if (estateType) req.estateType = estateType;
    if (newBuildOnly) req.newBuildOnly = true;
    if (groupBy.length) req.groupBy = groupBy;
    onSearch(req);
  }

  function toggleGroupBy(dim: GroupByDimension) {
    setGroupBy(prev =>
      prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5">
      {/* Main search input */}
      <div>
        <label className="label" htmlFor="query">
          Search postcode or street
        </label>
        <input
          id="query"
          type="text"
          className="input text-base"
          placeholder="e.g. SW11 1AD · SW11 · ST JOHNS HILL, SW11"
          value={query}
          onChange={e => setQuery(e.target.value)}
          required
        />
        <p className="mt-1 text-xs text-gray-500">
          Enter a full postcode, partial postcode (district or sector), or street name with postcode qualifier.
        </p>
      </div>

      {/* Filters row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="dateFrom">From date</label>
          <input id="dateFrom" type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="dateTo">To date</label>
          <input id="dateTo" type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="propertyType">Property type</label>
          <select id="propertyType" className="select" value={propertyType} onChange={e => setPropertyType(e.target.value as PropertyTypeCode | '')}>
            <option value="">All types</option>
            <option value="D">Detached</option>
            <option value="S">Semi-detached</option>
            <option value="T">Terraced</option>
            <option value="F">Flat / Maisonette</option>
            <option value="O">Other</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="estateType">Estate type</label>
          <select id="estateType" className="select" value={estateType} onChange={e => setEstateType(e.target.value as EstateTypeCode | '')}>
            <option value="">All</option>
            <option value="F">Freehold</option>
            <option value="L">Leasehold</option>
          </select>
        </div>
      </div>

      {/* New build toggle */}
      <div className="flex items-center gap-3">
        <input
          id="newBuildOnly"
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-lr-green focus:ring-lr-green"
          checked={newBuildOnly}
          onChange={e => setNewBuildOnly(e.target.checked)}
        />
        <label htmlFor="newBuildOnly" className="text-sm text-gray-700 select-none">New builds only</label>
      </div>

      {/* Group-by selectors */}
      <div>
        <p className="label mb-2">Group results by</p>
        <div className="flex flex-wrap gap-2">
          {GROUP_BY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleGroupBy(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                groupBy.includes(opt.value)
                  ? 'bg-lr-green text-white border-lr-green'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-lr-green hover:text-lr-green'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={loading || !query.trim()}>
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
            </>
          )}
        </button>
        <span className="text-xs text-gray-400">
          Results are cached for up to 24 hours.
        </span>
      </div>
    </form>
  );
}
