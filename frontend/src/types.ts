export type PropertyTypeCode = 'D' | 'S' | 'T' | 'F' | 'O';
export type EstateTypeCode = 'F' | 'L';

export interface PropertyTypeSummary {
  propertyType: string;
  label: string;
  totalProperties: number;
  includedCount: number;
  meanAvgGbpPerYear: number;
  medianAvgGbpPerYear: number;
  meanAvgPctPerYear: number;
  medianAvgPctPerYear: number;
  meanCagr: number;
  medianCagr: number;
}

export interface OverallSummary {
  all: PropertyTypeSummary;
  byPropertyType: PropertyTypeSummary[];
}

export type GroupByDimension =
  | 'postcodeUnit'
  | 'postcodeSector'
  | 'postcodeDistrict'
  | 'propertyType'
  | 'buildingOrStreet';

export interface Address {
  displayAddress: string;
  postcode: string;
  street: string;
  paon: string;
  saon: string;
  town: string;
  county: string;
  district: string;
}

export interface Transaction {
  id: string;
  price: number;
  date: string;
  propertyType: PropertyTypeCode;
  estateType: EstateTypeCode;
  newBuild: boolean;
  transactionCategory: string;
  linkedDataUri: string;
}

export interface PropertyMetrics {
  firstSalePrice: number;
  firstSaleDate: string;
  lastSalePrice: number;
  lastSaleDate: string;
  absoluteChange: number;
  percentChange: number;
  yearsElapsed: number;
  avgGbpPerYear: number;
  avgPctPerYear: number;
  cagr: number;
  transactionCount: number;
}

export interface PropertyRecord {
  propertyKey: string;
  address: Address;
  transactions: Transaction[];
  metrics?: PropertyMetrics;
}

export interface GroupMetrics {
  groupKey: string;
  groupLabel: string;
  propertyCount: number;
  includedCount: number;
  meanAbsoluteChange: number;
  medianAbsoluteChange: number;
  meanPercentChange: number;
  medianPercentChange: number;
  meanAvgGbpPerYear: number;
  meanCagr: number;
  minPercentChange: number;
  maxPercentChange: number;
  minFirstSaleDate: string;
  maxLastSaleDate: string;
}

export interface SearchRequest {
  sessionId: string;
  query: string;
  dateFrom?: string;
  dateTo?: string;
  propertyType?: string;
  estateType?: string;
  newBuildOnly?: boolean;
  groupBy?: GroupByDimension[];
}

export interface SearchResponse {
  properties: PropertyRecord[];
  groups: GroupMetrics[];
  overallSummary: OverallSummary;
  summary: {
    totalTransactions: number;
    totalProperties: number;
    propertiesWithMetrics: number;
    queryType: string;
    dateRange: { min: string; max: string } | null;
  };
  warnings: string[];
  isPartialResult: boolean;
  capsTriggered: boolean;
}

export interface UploadResponse {
  sessionId: string;
  totalRows: number;
  skippedRows: number;
  skippedReasons: string[];
  dateRange: { min: string; max: string } | null;
  uniquePostcodes: number;
  uniqueProperties: number;
  processingLog: string[];
}
