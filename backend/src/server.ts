import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import searchRouter from './routes/search';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }));
app.use(express.json());

// Per-IP rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests; please wait before trying again.' },
});
app.use(limiter);

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/search', searchRouter);

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`UK Property Analyzer backend listening on http://localhost:${PORT}`);
});

export default app;
