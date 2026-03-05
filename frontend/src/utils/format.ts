export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat/Maisonette', O: 'Other',
};

export const ESTATE_TYPE_LABELS: Record<string, string> = {
  F: 'Freehold', L: 'Leasehold',
};

export function formatGBP(value: number, decimals = 0): string {
  return '£' + value.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPct(value: number, decimals = 1): string {
  const sign = value >= 0 ? '+' : '';
  return sign + (value * 100).toFixed(decimals) + '%';
}

export function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function formatYears(y: number): string {
  if (y < 1) return `${Math.round(y * 12)} months`;
  return y.toFixed(1) + ' yrs';
}
