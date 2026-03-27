import { Router, Request, Response } from 'express';
import { getDb, getLoadingState } from '../services/database';
import { computePropertyMetrics } from '../services/metrics';
import { Transaction, Address, PropertyRecord } from '../types';

const router = Router();

interface DbRow {
  unique_id: string;
  price_paid: number;
  deed_date: string;
  postcode: string;
  property_type: string;
  new_build: number;
  estate_type: string;
  paon: string;
  saon: string;
  street: string;
  locality: string;
  town: string;
  district_name: string;
  county: string;
  transaction_category: string;
  property_key: string;
  display_address: string;
}

// GET /api/property?key=<property_key>
router.get('/', (req: Request, res: Response) => {
  const { status } = getLoadingState();
  if (status !== 'ready') {
    res.status(503).json({ error: 'Database not ready yet.' });
    return;
  }

  const key = (req.query.key as string | undefined)?.trim();
  if (!key) {
    res.status(400).json({ error: 'key query parameter is required.' });
    return;
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM transactions WHERE property_key = ? ORDER BY deed_date, unique_id`,
    )
    .all(key) as DbRow[];

  if (rows.length === 0) {
    res.status(404).json({ error: 'Property not found.' });
    return;
  }

  const sample = rows[0];
  const address: Address = {
    displayAddress: sample.display_address,
    postcode:       sample.postcode,
    street:         sample.street       ?? '',
    paon:           sample.paon         ?? '',
    saon:           sample.saon         ?? '',
    town:           sample.town         ?? '',
    county:         sample.county       ?? '',
    district:       sample.district_name ?? '',
  };
  const transactions: Transaction[] = rows.map(r => ({
    id:                  r.unique_id,
    price:               r.price_paid,
    date:                r.deed_date,
    propertyType:        r.property_type as Transaction['propertyType'],
    estateType:          r.estate_type   as Transaction['estateType'],
    newBuild:            r.new_build === 1,
    transactionCategory: r.transaction_category ?? '',
    linkedDataUri:       r.unique_id
      ? `https://landregistry.data.gov.uk/data/ppi/transaction/${r.unique_id}/current`
      : '',
  }));
  const metrics = computePropertyMetrics(transactions, true);
  const record: PropertyRecord = { propertyKey: key, address, transactions, metrics };

  res.json(record);
});

export default router;
