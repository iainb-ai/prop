export type PropertyTypeCode = 'D' | 'S' | 'T' | 'F' | 'O';
export type EstateTypeCode = 'F' | 'L';
export type GroupByDimension = 'postcodeUnit' | 'postcodeSector' | 'postcodeDistrict' | 'propertyType' | 'buildingOrStreet';

export interface SearchRequest {
  query: string;
  dateFrom?: string;
  dateTo?: string;
  propertyType?: PropertyTypeCode;
  newBuildOnly?: boolean;
  estateType?: EstateTypeCode;
  groupBy?: GroupByDimension[];
}

export interface Address {
  id: string;
  postcode: string;
  street: string;
  paon: string;
  saon: string;
  town: string;
  displayAddress: string;
}

export interface Transaction {
  id: string;
  uri: string;
  price: number;
  date: string;
  propertyType: PropertyTypeCode;
  estateType: EstateTypeCode;
  newBuild: boolean;
  addressId: string;
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

export interface PropertyRecord {
  addressId: string;
  address: Address;
  transactions: Transaction[];
  metrics?: PropertyMetrics;
}

export interface GroupMetrics {
  key: string;
  label: string;
  propertyCount: number;
  includedCount: number;
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

export interface SearchSummary {
  totalProperties: number;
  totalTransactions: number;
  propertiesWithMultipleSales: number;
  dateMin: string;
  dateMax: string;
  queryType: 'fullPostcode' | 'partialPostcode' | 'street';
}

export interface SearchResponse {
  properties: PropertyRecord[];
  groups: GroupMetrics[];
  summary: SearchSummary;
  warnings: string[];
  isPartialResult: boolean;
  capsTriggered: boolean;
}
