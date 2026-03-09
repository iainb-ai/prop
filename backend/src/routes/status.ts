import { Router, Request, Response } from 'express';
import { getLoadingState } from '../services/database';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(getLoadingState());
});

export default router;
