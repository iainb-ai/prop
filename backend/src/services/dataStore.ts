import { ParsedDataset } from '../types';

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface StoredEntry {
  dataset: ParsedDataset;
  expiresAt: number;
}

const store = new Map<string, StoredEntry>();

export function saveDataset(sessionId: string, dataset: ParsedDataset): void {
  store.set(sessionId, {
    dataset,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  pruneExpired();
}

export function getDataset(sessionId: string): ParsedDataset | null {
  const entry = store.get(sessionId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(sessionId);
    return null;
  }
  return entry.dataset;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now > entry.expiresAt) store.delete(id);
  }
}
