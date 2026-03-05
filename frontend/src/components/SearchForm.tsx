import { useState } from 'react';
import { GroupByDimension } from '../types';

interface SearchParams {
  query: string;
  dateFrom?: string;
  dateTo?: string;
  propertyType?: string;
  estateType?: string;
  newBuildOnly?: boolean;
  groupBy?: GroupByDimension[];
}

interface Props {
  onSearch: (params: SearchParams) => void;
  searching: boolean;
  error: string | null;
}

const GROUP_BY_OPTIONS: { value: GroupByDimension; label: string }[] = [
  { value: 'postcodeUnit',    label: 'Postcode (unit)' },
  { value: 'postcodeSector',  label: 'Postcode (sector)' },
  { value: 'postcodeDistrict', label: 'Postcode (district)' },
  { value: 'propertyType',    label: 'Property type' },
  { value: 'buildingOrStreet', label: 'Building / street' },
];

export default function SearchForm({ onSearch, searching, error }: Props) {
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [estateType, setEstateType] = useState('');
  const [newBuildOnly, setNewBuildOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupByDimension[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function toggleGroupBy(dim: GroupByDimension) {
    setGroupBy(prev =>
      prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    onSearch({
      query: query.trim(),
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      propertyType: propertyType || undefined,
      estateType: estateType || undefined,
      newBuildOnly: newBuildOnly || undefined,
      groupBy: groupBy.length > 0 ? groupBy : undefined,
    });
  }

  return (
    <div className="card">
      <h2 className="font-semibold text-gray-900 mb-3">Search Your Data</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Main query */}
        <div>
          <label className="label">Postcode or Street Name</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. SW11 1AD  or  SW11  or  ST JOHNS HILL, SW11"
              disabled={searching}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={searching || query.trim().length < 2}
            >
              {searching ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Searching
                </span>
              ) : 'Search'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Full postcode, partial (district/sector), or street name with postcode qualifier
          </p>
        </div>

        {/* Toggle advanced filters */}
        <button
          type="button"
          className="text-sm text-lr-green hover:underline"
          onClick={() => setShowAdvanced(v => !v)}
        >
          {showAdvanced ? '▲ Hide filters & grouping' : '▼ Show filters & grouping'}
        </button>

        {showAdvanced && (
          <div className="space-y-4 pt-2 border-t border-gray-100">
            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">From date</label>
                <input
                  type="date"
                  className="input"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  disabled={searching}
                />
              </div>
              <div>
                <label className="label">To date</label>
                <input
                  type="date"
                  className="input"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  disabled={searching}
                />
              </div>
            </div>

            {/* Property & estate type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Property type</label>
                <select
                  className="select"
                  value={propertyType}
                  onChange={e => setPropertyType(e.target.value)}
                  disabled={searching}
                >
                  <option value="">All types</option>
                  <option value="D">Detached</option>
                  <option value="S">Semi-detached</option>
                  <option value="T">Terraced</option>
                  <option value="F">Flat/Maisonette</option>
                  <option value="O">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Estate type</label>
                <select
                  className="select"
                  value={estateType}
                  onChange={e => setEstateType(e.target.value)}
                  disabled={searching}
                >
                  <option value="">All</option>
                  <option value="F">Freehold</option>
                  <option value="L">Leasehold</option>
                </select>
              </div>
            </div>

            {/* New build toggle */}
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={newBuildOnly}
                onChange={e => setNewBuildOnly(e.target.checked)}
                disabled={searching}
                className="rounded border-gray-300 text-lr-green focus:ring-lr-green"
              />
              New builds only
            </label>

            {/* Group by */}
            <div>
              <label className="label">Group results by</label>
              <div className="flex flex-wrap gap-2">
                {GROUP_BY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleGroupBy(opt.value)}
                    disabled={searching}
                    className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                      groupBy.includes(opt.value)
                        ? 'bg-lr-green text-white border-lr-green'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-lr-green'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
