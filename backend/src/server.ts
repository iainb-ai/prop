import express from 'express';
import cors from 'cors';
import statusRouter from './routes/status';
import searchRouter from './routes/search';
import { initDatabase } from './services/database';

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/status', statusRouter);
app.use('/api/search', searchRouter);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  initDatabase().catch(err => console.error('DB init failed:', err));
});
