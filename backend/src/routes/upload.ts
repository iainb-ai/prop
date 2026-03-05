import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { parseCsv } from '../services/csvParser';
import { saveDataset, getDataset } from '../services/dataStore';
import { UploadResponse } from '../types';

const router = Router();

// Memory storage — files are held in buffer, not written to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted.'));
    }
  },
});

// POST /api/upload
router.post('/', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded.' });
    return;
  }

  try {
    const dataset = parseCsv(req.file.buffer);
    const sessionId = uuidv4();
    saveDataset(sessionId, dataset);

    const uniquePostcodes = new Set(dataset.transactions.map(t => t.postcode)).size;

    const response: UploadResponse = {
      sessionId,
      totalRows: dataset.totalRows,
      skippedRows: dataset.skippedRows,
      skippedReasons: dataset.skippedReasons,
      dateRange: dataset.dateRange,
      uniquePostcodes,
      uniqueProperties: dataset.uniquePropertyCount,
      processingLog: buildProcessingLog(dataset, uniquePostcodes),
    };

    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: msg });
  }
});

// GET /api/upload/:sessionId — check session is still alive
router.get('/:sessionId', (req: Request, res: Response) => {
  const dataset = getDataset(String(req.params.sessionId));
  if (!dataset) {
    res.status(404).json({ error: 'Session expired or not found.' });
    return;
  }
  const uniquePostcodes = new Set(dataset.transactions.map(t => t.postcode)).size;
  res.json({
    valid: true,
    totalRows: dataset.totalRows,
    uniqueProperties: dataset.uniquePropertyCount,
    uniquePostcodes,
    dateRange: dataset.dateRange,
    uploadedAt: dataset.uploadedAt,
  });
});

function buildProcessingLog(
  dataset: ReturnType<typeof parseCsv>,
  uniquePostcodes: number,
): string[] {
  const log: string[] = [];
  log.push(`✓ CSV parsed: ${dataset.totalRows} rows read`);
  if (dataset.skippedRows > 0) {
    log.push(`⚠ ${dataset.skippedRows} rows skipped (missing or invalid data)`);
  }
  log.push(`✓ ${dataset.transactions.length} valid transactions loaded`);
  log.push(`✓ ${dataset.uniquePropertyCount} unique properties identified`);
  log.push(`✓ ${uniquePostcodes} unique postcodes found`);
  if (dataset.dateRange) {
    log.push(`✓ Date range: ${dataset.dateRange.min} to ${dataset.dateRange.max}`);
  }
  log.push('✓ Ready to search — enter a postcode or street name below');
  return log;
}

export default router;
