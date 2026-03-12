import { Router, Request, Response } from 'express';
import { RentVsBuyRequest } from '../types';
import { runProjection } from '../services/rentVsBuy';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  const body = req.body as RentVsBuyRequest;

  // Basic validation
  const errors: string[] = [];
  if (!body.purchasePrice || body.purchasePrice <= 0)       errors.push('purchasePrice must be positive');
  if (body.deposit == null || body.deposit <= 0)            errors.push('deposit must be positive');
  if (body.deposit >= body.purchasePrice)                   errors.push('deposit must be less than purchasePrice');
  if (!body.annualRate || body.annualRate <= 0 || body.annualRate >= 1)
                                                            errors.push('annualRate must be between 0 and 1');
  if (!body.termMonths || body.termMonths <= 0)             errors.push('termMonths must be positive');
  if (!body.horizonMonths || body.horizonMonths <= 0)       errors.push('horizonMonths must be positive');

  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }

  try {
    const result = runProjection(body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Calculation failed' });
  }
});

export default router;
