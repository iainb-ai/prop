export type PropertyTypeCode = 'D' | 'S' | 'T' | 'F' | 'O';
export type EstateTypeCode = 'F' | 'L';

export interface LoadingState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  progress: number;
  rowsProcessed: number;
  message: string;
  log: string[];
  error?: string;
}

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

export interface YearlyDataPoint {
  year: number;
  medianPrice: number;
  meanPrice: number;
  q1Price: number;
  q3Price: number;
  count: number;
  yoyPctChange: number | null;
  priceIndex: number | null;
}

export interface PropertyTypeTrend {
  propertyType: string;
  label: string;
  color: string;
  dataPoints: YearlyDataPoint[];
  cagr: number | null;
  totalTransactions: number;
}

export interface MarketTrends {
  byPropertyType: PropertyTypeTrend[];
  combined: PropertyTypeTrend;
  yearRange: { min: number; max: number };
  totalTransactions: number;
  isTruncated: boolean;
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
  marketTrends: MarketTrends;
  summary: {
    totalTransactions: number;
    totalProperties: number;
    propertiesWithMetrics: number;
    queryType: string;
    dateRange: { min: string; max: string } | null;
    isTruncated: boolean;
  };
  warnings: string[];
}

// ─── Rent vs Buy API ──────────────────────────────────────────────────────────

export interface RentVsBuyRequest {
  purchasePrice: number;
  deposit: number;
  horizonMonths: number;
  sellAtEnd: boolean;
  mortgageType: 'repayment' | 'interest_only';
  annualRate: number;
  termMonths: number;
  mortgageArrangementFee: number;
  monthlyRent: number;
  rentAnnualInflation: number;
  renterMonthlyCosts: number;
  annualPropertyGrowth: number;
  maintenancePct: number;
  councilTaxAnnual: number;
  homeInsuranceAnnual: number;
  serviceChargeAnnual: number;
  runningCostInflation: number;
  investmentGrossAnnualReturn: number;
  investmentAnnualFees: number;
  investmentTaxDrag: number;
  firstTimeBuyer: boolean;
  additionalPropertySurcharge: boolean;
  nonUkResidentSurcharge: boolean;
  legalFeesPurchase: number;
  surveyValuation: number;
  movingMiscCosts: number;
  estateAgentFeePct: number;
  saleLegalFixedCosts: number;
  overrideBudget: boolean;
  manualMonthlyBudget: number;
  budgetAnnualGrowth: number;
}

export interface RentVsBuyMonthRow {
  month: number;
  date: string;
  budget: number;
  rent: number;
  renterCosts: number;
  totalRentOutflow: number;
  rentInvestContrib: number;
  rentInvestBal: number;
  rentNetWorth: number;
  mortgagePmt: number;
  ownerRunningCosts: number;
  totalOwnerOutflow: number;
  buyInvestContrib: number;
  buyInvestBal: number;
  propertyValue: number;
  mortgageBalance: number;
  saleCosts: number;
  upfrontCosts: number;
  buyNetWorth: number;
  diffBuyMinusRent: number;
  buyBetter: 0 | 1;
}

export interface RentVsBuyResponse {
  sdlt: number;
  totalUpfront: number;
  monthlyPmt: number;
  breakEvenMonth: number | null;
  finalBuyNetWorth: number;
  finalRentNetWorth: number;
  months: RentVsBuyMonthRow[];
}
