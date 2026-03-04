// ── Shared domain types ─────────────────────────────────────────────────────

export type PropertyTypeCode = 'D' | 'S' | 'T' | 'F' | 'O';
export type EstateTypeCode = 'F' | 'L';

export interface SearchRequest {
  query: string; // postcode or "STREET NAME, POSTCODE"
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  propertyType?: PropertyTypeCode;
  newBuildOnly?: boolean;
  estateType?: EstateTypeCode;
  groupBy?: GroupByDimension[];
}

export type GroupByDimension = 'postcodeUnit' | 'postcodeSector' | 'postcodeDistrict' | 'propertyType' | 'buildingOrStreet';

export interface Address {
  id: string; // address resource URI
  postcode: string;
  street: string;
  paon: string;
  saon: string;
  town: string;
  county?: string;
  district?: string;
  addressLine1?: string;
  addressLine2?: string;
  displayAddress: string;
}

export interface Transaction {
  id: string;
  uri: string;
  price: number;
  date: string; // ISO date YYYY-MM-DD
  propertyType: PropertyTypeCode;
  estateType: EstateTypeCode;
  newBuild: boolean;
  addressId: string;
}

export interface PropertyRecord {
  addressId: string;
  address: Address;
  transactions: Transaction[]; // sorted by date asc
  metrics?: PropertyMetrics;
}

export interface PropertyMetrics {
  firstPrice: number;
  firstDate: string;
  lastPrice: number;
  lastDate: string;
  yearsElapsed: number;
  absoluteChange: number;
  percentChange: number;
  avgGbpPerYear: number;
  avgPctPerYear: number;
  cagr: number;
  transactionCount: number;
}

export interface GroupMetrics {
  key: string;
  label: string;
  propertyCount: number;
  includedCount: number; // >= 2 sales
  meanAbsoluteChange: number;
  medianAbsoluteChange: number;
  meanPercentChange: number;
  medianPercentChange: number;
  meanAvgGbpPerYear: number;
  medianAvgGbpPerYear: number;
  meanCagr: number;
  medianCagr: number;
  minPercentChange: number;
  maxPercentChange: number;
  minFirstSaleDate: string;
  maxLastSaleDate: string;
}

export interface SearchResponse {
  properties: PropertyRecord[];
  groups: GroupMetrics[];
  summary: SearchSummary;
  warnings: string[];
  isPartialResult: boolean;
  capsTriggered: boolean;
}

export interface SearchSummary {
  totalProperties: number;
  totalTransactions: number;
  propertiesWithMultipleSales: number;
  dateMin: string;
  dateMax: string;
  queryType: 'fullPostcode' | 'partialPostcode' | 'street';
}

// Raw LDA API response shapes.
// The HM Land Registry API uses _about (not @id) for resource URIs.
export interface LdaItem {
  '_about'?: string;      // transaction record URI
  transactionId?: string; // UUID returned as top-level field
  transactionDate?: string;
  pricePaid?: number;
  // propertyType / estateType: objects with _about URI + label array
  propertyType?: { '_about'?: string; label?: Array<{ _value: string }> } | string;
  estateType?: { '_about'?: string; label?: Array<{ _value: string }> } | string;
  newBuild?: boolean | string;
  propertyAddress?: LdaAddress;
  [key: string]: unknown;
}

export interface LdaAddress {
  '_about'?: string;  // address resource URI
  postcode?: string;
  street?: string;
  paon?: string;
  saon?: string;
  town?: string;
  county?: string;
  district?: string;
  addressLine1?: string;
  addressLine2?: string;
  [key: string]: unknown;
}

export interface LdaResponse {
  result?: {
    items?: LdaItem[];
    totalResults?: number;
    startIndex?: number;
    itemsPerPage?: number;
    page?: number;
    format?: string;
    type?: string;
  };
}

// SPARQL endpoint response shapes (application/sparql-results+json)
export interface SparqlBinding {
  type: 'uri' | 'literal' | 'bnode';
  value: string;
  datatype?: string;
  lang?: string;
}

export type SparqlRow = Record<string, SparqlBinding>;

export interface SparqlResponse {
  head: { vars: string[] };
  results: { bindings: SparqlRow[] };
}
