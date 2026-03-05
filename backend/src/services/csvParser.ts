import { parse } from 'csv-parse/sync';
import { CsvTransaction, ParsedDataset, PropertyTypeCode, EstateTypeCode } from '../types';

const EXPECTED_HEADERS = [
  'unique_id', 'price_paid', 'deed_date', 'postcode', 'property_type',
  'new_build', 'estate_type', 'saon', 'paon', 'street', 'locality',
  'town', 'district', 'county', 'transaction_category', 'linked_data_uri',
];

// Normalise postcode to "SW11 1AD" canonical form
export function normalisePostcode(raw: string): string {
  const upper = raw.toUpperCase().replace(/\s+/g, '').trim();
  if (upper.length < 4) return upper;
  return upper.slice(0, upper.length - 3) + ' ' + upper.slice(upper.length - 3);
}

// Parse deed_date — supports "DD/MM/YYYY" and "YYYY-MM-DD"
function parseDeedDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split('/');
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    if (dd && mm && yyyy && yyyy.length === 4) {
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  return null;
}

function coercePropertyType(raw: string): PropertyTypeCode {
  const v = raw.trim().toUpperCase();
  if (v === 'D' || v === 'S' || v === 'T' || v === 'F' || v === 'O') return v;
  return 'O';
}

function coerceEstateType(raw: string): EstateTypeCode {
  return raw.trim().toUpperCase() === 'L' ? 'L' : 'F';
}

// Build a canonical property key from address components
function buildPropertyKey(
  postcode: string, saon: string, paon: string, street: string, town: string,
): string {
  return [postcode, saon, paon, street, town]
    .map(s => s.toUpperCase().replace(/\s+/g, ' ').trim())
    .join('|');
}

// Build display address from CSV fields
function buildDisplayAddress(
  saon: string, paon: string, street: string, locality: string,
  town: string, postcode: string,
): string {
  const parts = [saon, paon, street, locality, town, postcode].filter(Boolean);
  return parts.join(', ');
}

export function parseCsv(buffer: Buffer): ParsedDataset {
  const log: string[] = [];
  log.push('Parsing CSV file...');

  // Strip BOM if present
  let content = buffer.toString('utf-8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

  let rows: Record<string, string>[];
  try {
    rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw new Error(`CSV parse error: ${(err as Error).message}`);
  }

  log.push(`Read ${rows.length} rows from CSV.`);

  if (rows.length === 0) throw new Error('CSV file is empty.');

  // Validate headers
  const actualHeaders = Object.keys(rows[0]).map(h => h.toLowerCase().trim());
  const missing = EXPECTED_HEADERS.filter(h => !actualHeaders.includes(h));
  if (missing.length > 0) {
    throw new Error(`CSV missing required columns: ${missing.join(', ')}`);
  }

  log.push('Column headers validated.');

  const transactions: CsvTransaction[] = [];
  const skippedReasons: string[] = [];
  let skippedRows = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;
  const propertyKeys = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const uniqueId = (row['unique_id'] || '').trim();
    const rawPrice = (row['price_paid'] || '').trim();
    const rawDate = (row['deed_date'] || '').trim();
    const rawPostcode = (row['postcode'] || '').trim();

    if (!rawPrice || !rawDate || !rawPostcode) {
      skippedRows++;
      if (skippedReasons.length < 5) {
        skippedReasons.push(`Row ${i + 2}: missing price, date, or postcode`);
      }
      continue;
    }

    const pricePaid = parseFloat(rawPrice.replace(/[£,]/g, ''));
    if (isNaN(pricePaid) || pricePaid <= 0) {
      skippedRows++;
      if (skippedReasons.length < 5) {
        skippedReasons.push(`Row ${i + 2}: invalid price "${rawPrice}"`);
      }
      continue;
    }

    const deedDate = parseDeedDate(rawDate);
    if (!deedDate) {
      skippedRows++;
      if (skippedReasons.length < 5) {
        skippedReasons.push(`Row ${i + 2}: unparseable date "${rawDate}"`);
      }
      continue;
    }

    const postcode = normalisePostcode(rawPostcode);
    const saon = (row['saon'] || '').trim();
    const paon = (row['paon'] || '').trim();
    const street = (row['street'] || '').trim();
    const locality = (row['locality'] || '').trim();
    const town = (row['town'] || '').trim();
    const district = (row['district'] || '').trim();
    const county = (row['county'] || '').trim();

    const propertyKey = buildPropertyKey(postcode, saon, paon, street, town);
    propertyKeys.add(propertyKey);

    const tx: CsvTransaction = {
      uniqueId,
      pricePaid,
      deedDate,
      postcode,
      propertyType: coercePropertyType(row['property_type'] || ''),
      newBuild: (row['new_build'] || '').trim().toUpperCase() === 'Y',
      estateType: coerceEstateType(row['estate_type'] || ''),
      saon,
      paon,
      street,
      locality,
      town,
      district,
      county,
      transactionCategory: (row['transaction_category'] || '').trim(),
      linkedDataUri: (row['linked_data_uri'] || '').trim(),
      propertyKey,
      displayAddress: buildDisplayAddress(saon, paon, street, locality, town, postcode),
    };

    transactions.push(tx);

    if (!minDate || deedDate < minDate) minDate = deedDate;
    if (!maxDate || deedDate > maxDate) maxDate = deedDate;
  }

  const uniquePostcodes = new Set(transactions.map(t => t.postcode)).size;
  log.push(`Parsed ${transactions.length} valid transactions.`);
  if (skippedRows > 0) log.push(`Skipped ${skippedRows} rows with missing/invalid data.`);
  log.push(`Found ${propertyKeys.size} unique properties across ${uniquePostcodes} postcodes.`);
  if (minDate && maxDate) log.push(`Date range: ${minDate} to ${maxDate}.`);

  return {
    transactions,
    uploadedAt: new Date(),
    totalRows: rows.length,
    skippedRows,
    skippedReasons,
    dateRange: minDate && maxDate ? { min: minDate, max: maxDate } : null,
    uniquePropertyCount: propertyKeys.size,
  };
}
