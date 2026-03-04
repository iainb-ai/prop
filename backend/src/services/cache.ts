import NodeCache from 'node-cache';

// TTL in seconds: 24h for small queries, 6h for large
const SMALL_TTL = 24 * 60 * 60;
const LARGE_TTL = 6 * 60 * 60;
const LARGE_THRESHOLD = 200; // transactions

const cache = new NodeCache({ checkperiod: 120 });

export function getCached<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function setCached<T>(key: string, value: T, itemCount: number): void {
  const ttl = itemCount > LARGE_THRESHOLD ? LARGE_TTL : SMALL_TTL;
  cache.set(key, value, ttl);
}

export function buildCacheKey(params: Record<string, unknown>): string {
  return JSON.stringify(params, Object.keys(params).sort());
}
