export function formatGBP(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

export function formatPct(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(decimals)}%`;
}

export function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatYears(y: number): string {
  return `${y.toFixed(1)} yr${y !== 1 ? 's' : ''}`;
}

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat / Maisonette', O: 'Other',
};

export const ESTATE_TYPE_LABELS: Record<string, string> = {
  F: 'Freehold', L: 'Leasehold',
};
