import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import statusRouter from './routes/status';
import searchRouter from './routes/search';
import rentVsBuyRouter from './routes/rentVsBuy';
import uploadRouter from './routes/upload';
import propertyRouter from './routes/property';
import { initDatabase } from './services/database';

const app  = express();
const PORT = process.env.PORT ?? 3001;

// ─── Request ID + timing middleware ───────────────────────────────────────────

let reqCounter = 0;

app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as Request & { id: string }).id = String(++reqCounter);
  const t0 = Date.now();
  _res.on('finish', () => {
    const ms = Date.now() - t0;
    if (ms > 500) {
      // Only log slow requests (> 500 ms) to keep output concise
      console.log(`[req:${(req as Request & { id: string }).id}] ${req.method} ${req.path} → ${_res.statusCode} (${ms}ms)`);
    }
  });
  next();
});

// ─── Core middleware ──────────────────────────────────────────────────────────

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/status',      statusRouter);
app.use('/api/upload',      uploadRouter);
app.use('/api/search',      searchRouter);
app.use('/api/property',    propertyRouter);
app.use('/api/rent-vs-buy', rentVsBuyRouter);

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[unhandled]', err instanceof Error ? err.stack : String(err));
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] Backend running on http://localhost:${PORT}`);
  initDatabase().catch(err => console.error('[server] DB init failed:', err));
});
