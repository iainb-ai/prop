# UK Property Price History Analyser — Implementation Notes

> **Addendum to:** `UK_Property_Price_History_Analyzer_PRD.docx` (v1.0, 3 March 2026)
> **Status:** MVP delivered
> **Last updated:** March 2026

This document records the actual implementation decisions, API findings, deviations from the PRD, and verified facts about the HM Land Registry data endpoints. It should be read alongside the original PRD.

---

## Table of contents

1. [Tech stack](#1-tech-stack)
2. [API endpoint decisions (§6)](#2-api-endpoint-decisions-§6)
3. [Actual Land Registry API response format](#3-actual-land-registry-api-response-format)
4. [Search strategy implemented (§7)](#4-search-strategy-implemented-§7)
5. [Metrics — verified implementation (§9)](#5-metrics--verified-implementation-§9)
6. [Performance findings](#6-performance-findings)
7. [Bugs found and fixed during development](#7-bugs-found-and-fixed-during-development)
8. [Known limitations vs PRD scope](#8-known-limitations-vs-prd-scope)
9. [Security — SPARQL injection mitigations (§6.3)](#9-security--sparql-injection-mitigations-§63)
10. [Acceptance criteria status (§14)](#10-acceptance-criteria-status-§14)

---

## 1. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend runtime | Node.js 24 + Express + TypeScript | Lightweight, async-first, well-suited for HTTP fan-out |
| Frontend | React 18 + Vite + TypeScript | Fast dev cycle; component model fits tab/panel layout |
| Styling | Tailwind CSS v3 | Utility-first; no design system overhead for MVP |
| Charts | Recharts 2 | React-native; handles time-series and bar charts required by PRD |
| HTTP client | Axios | Retry interceptors, timeout, parameter serialisation |
| Cache | node-cache (in-memory) | No external dependency; sufficient for single-instance MVP |

---

## 2. API endpoint decisions (§6)

### 2.1 Full postcode — LDA transaction-record endpoint

**Endpoint used:**
```
GET https://landregistry.data.gov.uk/data/ppi/transaction-record.json
    ?propertyAddress.postcode=SW11+1AD
    &_pageSize=100
    &_sort=transactionDate
    &_page=0
```

The LDA dot-notation parameter `propertyAddress.postcode` works correctly for exact-match full postcode lookups. Pagination via `_page` / `_pageSize` is reliable. This approach is retained for full postcode queries.

Optional filters passed as additional LDA parameters:
- `propertyType` — single letter code (D/S/T/F/O)
- `estateType` — F or L
- `newBuild` — string `"true"`

### 2.2 Partial postcode and street — SPARQL endpoint (deviation from PRD)

**The PRD proposed** using the LDA `_where` parameter with a SPARQL graph pattern for partial/prefix matching. During testing this approach was found to be unreliable (the Elda LDA implementation does not consistently honour complex `_where` SPARQL fragments including `FILTER(STRSTARTS(...))`).

**Decision: switch to the SPARQL endpoint directly.**

```
GET https://landregistry.data.gov.uk/landregistry/query
    ?query=<URL-encoded SPARQL>
    &output=json
```

This endpoint is available via the Land Registry SPARQL console at `https://landregistry.data.gov.uk/qonsole` and supports the full SPARQL 1.1 query language including `STRSTARTS`, `FILTER`, `OPTIONAL`, `ORDER BY`, and `LIMIT`/`OFFSET`.

**SPARQL query pattern used (partial postcode example for "SW11"):**

```sparql
PREFIX ppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
SELECT ?transaction ?address ?paon ?saon ?street ?town ?postcode
       ?price ?date ?propertyType ?newBuild ?estateType
WHERE {
  ?transaction ppi:propertyAddress ?address ;
               ppi:pricePaid ?price ;
               ppi:transactionDate ?date ;
               ppi:propertyType ?propertyType ;
               ppi:newBuild ?newBuild ;
               ppi:estateType ?estateType .
  ?address lrcommon:postcode ?postcode ;
           lrcommon:paon ?paon ;
           lrcommon:street ?street ;
           lrcommon:town ?town .
  OPTIONAL { ?address lrcommon:saon ?saon }
  FILTER(STRSTARTS(STR(?postcode), "SW11"))
}
ORDER BY ?date
LIMIT 1001
```

The `LIMIT` is set to `cap + 1` (1,001) so the backend can detect truncation: if 1,001 rows are returned, the cap has been hit.

**SPARQL query pattern for street + postcode qualifier:**

```sparql
-- With partial postcode qualifier:
FILTER(STR(?street) = "ST JOHNS HILL" && STRSTARTS(STR(?postcode), "SW11"))

-- With full postcode qualifier:
FILTER(STR(?street) = "ST JOHNS HILL" && STR(?postcode) = "SW11 1AD")
```

---

## 3. Actual Land Registry API response format

These facts were verified by fetching real API responses during development. They differ from what was initially assumed.

### 3.1 LDA endpoint (`/data/ppi/transaction-record.json`)

| Field | Assumed | Actual |
|---|---|---|
| Resource URI key | `@id` (JSON-LD) | `_about` |
| `transactionDate` | ISO `"2010-07-28"` | RFC 2822 `"Tue, 04 May 2010"` |
| `propertyType` | string code | Object `{ _about: "http://.../flat-maisonette", label: [{_value: "Flat-maisonette"}] }` |
| `estateType` | string code | Object `{ _about: "http://.../leasehold", label: [...] }` |
| `transactionId` | embedded in URI only | Top-level field UUID string |
| `pricePaid` | may be string | Always numeric |
| Address ID | `propertyAddress["@id"]` | `propertyAddress["_about"]` |

**Date parsing:** RFC 2822 dates are parsed via `new Date(raw).toISOString().substring(0, 10)`.

**Property/estate type detection:** The `_about` URI is matched by substring:
- `"flat-maisonette"` → F
- `"semi-detached"` checked before `"detached"` to avoid false match → S/D
- `"leasehold"` → L; otherwise → F

### 3.2 SPARQL endpoint (`/landregistry/query`)

| Field | Format |
|---|---|
| `?transaction` | URI binding: `http://landregistry.data.gov.uk/data/ppi/transaction/<UUID>/current` |
| `?address` | URI binding: `http://landregistry.data.gov.uk/data/ppi/address/<hash>` |
| `?price` | Literal with datatype `xsd:integer`, value is string `"267000"` |
| `?date` | Literal with datatype `xsd:date`, value is ISO string `"2010-07-28"` ✓ |
| `?propertyType` | URI: `http://landregistry.data.gov.uk/def/common/flat-maisonette` |
| `?estateType` | URI: `http://landregistry.data.gov.uk/def/common/leasehold` |
| `?newBuild` | Literal `xsd:boolean`, value string `"true"` or `"false"` |
| `?paon`, `?saon`, `?street`, etc. | Plain string literals |

The SPARQL endpoint returns dates in ISO format directly, so no RFC 2822 conversion is needed.

---

## 4. Search strategy implemented (§7)

### 4.1 Query type detection

| Input pattern | Detection regex | Handler |
|---|---|---|
| Full postcode | `/^[A-Z]{1,2}\d{1,2}[A-Z]?\s+\d[A-Z]{2}$/` | LDA exact match |
| Partial postcode | `/^[A-Z]{1,2}\d{1,2}[A-Z]?(\s+\d)?$/` | SPARQL STRSTARTS |
| Street + qualifier | Everything else (comma-separated) | SPARQL street filter |

**Street + qualifier parsing:** The last comma-separated segment is treated as the postcode qualifier; everything before is the street name. Example: `"ST JOHNS HILL, SW11"` → street = `ST JOHNS HILL`, qualifier = `SW11`.

### 4.2 Normalisation implemented

- Postcode: upper-case, canonical spacing (`SW111AD` → `SW11 1AD`)
- Street: upper-case, collapse repeated spaces, strip non-alphanumeric except spaces/hyphens/apostrophes
- Postcode prefix: upper-case, strip non-alphanumeric except spaces

### 4.3 Pagination

| Search type | Approach | Cap |
|---|---|---|
| Full postcode | LDA `_page` / `_pageSize=100`, up to 10 pages | 1,000 transactions |
| Partial postcode | Single SPARQL request `LIMIT 1001` | 1,000 transactions |
| Street | Single SPARQL request `LIMIT 1001` | 1,000 transactions |

**Hard caps:** The PRD requires caps with an explicit incomplete flag. A district-level search (e.g., `SW11`) covers ~52,522 transactions; a sector (e.g., `SW11 1`) covers ~7,573. Both correctly trigger the cap and display a refinement prompt. This is intentional per §7.3 and §14.1 of the PRD.

---

## 5. Metrics — verified implementation (§9)

All formulas implemented exactly per PRD §9.2. The worked example from PRD §13 was used to validate:

| Metric | PRD formula | Implementation |
|---|---|---|
| Years elapsed | `Y = (D1 - D0).days / 365.25` | `(D1.getTime() - D0.getTime()) / (365.25 * 86_400_000)` |
| Absolute change | `P1 - P0` | Direct |
| Percent change | `(P1 - P0) / P0` | Direct |
| Avg GBP/yr (linear) | `delta_gbp / Y` | Direct |
| Avg %/yr (linear) | `delta_pct / Y` | Direct |
| CAGR | `(P1 / P0) ** (1 / Y) - 1` | `Math.pow(P1 / P0, 1 / Y) - 1` |

**PRD §13 verification (103, LUMIERE APARTMENTS, 58, ST JOHNS HILL, SW11 1AD):**

| Value | PRD §13 | Implementation output |
|---|---|---|
| First sale | £280,000 on 28/07/2010 | ✓ |
| Last sale | £355,000 on 18/06/2025 | ✓ |
| Absolute change | £75,000 | ✓ |
| Percent change | 26.8% (≈27% rounded) | ✓ |
| Years elapsed | 14.9 yrs (≈15 yrs) | ✓ |
| Avg GBP/yr | £5,037/yr | ✓ |
| Avg %/yr | 1.8%/yr | ✓ |
| CAGR | 1.6%/yr | ✓ |

**Group aggregation:** Implemented per §10.2 — per-property metrics are computed first, then mean and median of those per-property metrics are aggregated per group. Raw transaction averages are never used.

**Single-sale properties:** Properties with fewer than 2 transactions in the selected date range show "Only one sale in range" in the UI and are excluded from group aggregation counts.

---

## 6. Performance findings

### 6.1 LDA endpoint (full postcode)

- A full postcode (e.g., `SW11 1AD`) typically returns 10–200 transactions across 1–3 pages
- Response time: well within the PRD §2.2 target of 5 seconds

### 6.2 SPARQL endpoint (partial postcode / street)

| Query scope | ~Transaction count | Query time |
|---|---|---|
| Specific street (e.g., `ST JOHNS HILL, SW11`) | 200–500 | 10–20 s |
| Postcode sector (e.g., `SW11 1`) | ~7,573 total; returns 1,000 | 30–60 s |
| Postcode district (e.g., `SW11`) | ~52,522 total; returns 1,000 | 45–75 s |

**Note:** The SPARQL endpoint response time is significant for larger queries. Results are cached for 24 hours (small queries ≤200 transactions) or 6 hours (large queries), so repeated searches are near-instant.

**SPARQL timeout:** Set to 45 seconds. If exceeded, a partial result is returned with a warning.

### 6.3 Performance vs PRD §2.2 target

The PRD's 5-second target applies to *full postcode* queries with up to 500 records. Partial postcode queries were not given an explicit performance target and are inherently slower due to the dataset scale. The approach of caching, explicit incomplete flags, and refinement prompts satisfies the PRD's intent.

---

## 7. Bugs found and fixed during development

### Bug 1: `_about` vs `@id` (critical — caused zero results)

The initial implementation assumed the LDA API used JSON-LD's `@id` convention for resource URIs. The actual API uses `_about`. This caused:
- `extractAddressId()` always returning `""` → all transactions grouped as one "Unknown" property
- `addressMap` never being populated → fallback address `"Unknown ()"` for all properties

**Fix:** Changed all URI extraction from `item["@id"]` to `item["_about"]` throughout the normalisation layer.

### Bug 2: Date format mismatch (critical — caused NaN metrics)

The LDA API returns `transactionDate` in RFC 2822 format (`"Tue, 04 May 2010"`), not ISO (`"2010-07-28"`). Calling `.substring(0, 10)` on the RFC 2822 string produced `"Tue, 04 Ma"` — an invalid date — causing `new Date()` to return `Invalid Date` and all metrics to be `NaN`.

**Fix:** Added `parseTransactionDate()` which detects ISO format first and falls back to `new Date(raw).toISOString().substring(0, 10)` for RFC 2822 strings.

### Bug 3: Semi-detached misclassified as Detached

`coercePropertyType` iterated through a codes map that checked `"detached"` before `"semi-detached"`. The string `"semi-detached"` contains `"detached"`, so semi-detached properties were always classified as `D`.

**Fix:** Explicit ordered checks: `"semi-detached"` / `"semidetached"` before `"detached"`.

### Bug 4: Fallback key collapsed all orphaned transactions

When `addressId` was empty, `fallbackKey()` returned `""` for every transaction, merging them all into one property group.

**Fix:** Returns `"orphan-{transactionId}"` to give each transaction with a missing address its own bucket.

### Bug 5: LDA `_where` unreliable for partial postcodes

The Elda LDA implementation does not reliably handle complex `FILTER(STRSTARTS(...))` patterns in the `_where` parameter, causing partial postcode searches to fail silently and produce an incorrect "incomplete" flag with 0 results.

**Fix:** Switched `fetchByPartialPostcode` and `fetchByStreet` to use the SPARQL endpoint (`/landregistry/query`) directly, which is confirmed to support the full SPARQL 1.1 query language including `STRSTARTS`.

---

## 8. Known limitations vs PRD scope

| Item | PRD requirement | Status |
|---|---|---|
| §4.1 Full postcode search | ✓ | Implemented |
| §4.1 Partial postcode search | ✓ | Implemented via SPARQL |
| §4.1 Street + postcode qualifier | ✓ | Implemented via SPARQL |
| §9 All first-to-last metrics | ✓ | Implemented and verified |
| §10 Group by all 5 dimensions | ✓ | Implemented |
| §11.1 Search screen | ✓ | Implemented |
| §11.1 Results overview | ✓ | Implemented |
| §11.1 Property detail with timeline | ✓ | Implemented (line chart) |
| §11.2 CSV export (3 types) | ✓ | Implemented |
| §12.1 Backend-only API calls | ✓ | Frontend proxied via Vite to backend |
| §12.3 Caching | ✓ | In-memory NodeCache, 24h/6h TTL |
| §12.3 Rate limiting | ✓ | express-rate-limit, 30 req/min per IP |
| §12.3 Retry with backoff | ✓ | Implemented for LDA endpoint (3 retries) |
| §4.2 Inflation adjustment | Out of scope | Not implemented |
| §4.2 Forecasting | Out of scope | Not implemented |
| §4.2 User accounts | Out of scope | Not implemented |
| §4.2 EPC/floor area etc. | Out of scope | Not implemented |
| COUNT before fetch (total dataset size) | Not in PRD | Not implemented; SPARQL COUNT takes ~17s which is too slow for interactive pre-check |

---

## 9. Security — SPARQL injection mitigations (§6.3)

The PRD requires that raw user input is never interpolated into SPARQL fragments. The following mitigations are implemented:

1. **Postcode prefix whitelist:** `sanitisePostcodePrefix()` allows only `[A-Z0-9 ]`. No quotes, backslashes, or SPARQL metacharacters can appear.

2. **Street name whitelist:** `sanitiseStreet()` allows only `[A-Z0-9 '\-]`. Apostrophes are safe inside SPARQL double-quoted strings. Double quotes are blocked.

3. **SPARQL string escaping:** `escapeForSparql()` escapes `\` → `\\` and `"` → `\"` before embedding any value in a SPARQL string literal. Applied to all sanitised inputs.

4. **Property/estate type filters:** User-supplied codes (`D`, `S`, `T`, `F`, `O`, `F`, `L`) are mapped to pre-defined URI constants server-side. The raw codes are never embedded in SPARQL.

5. **Backend-only query construction:** All SPARQL queries are built in `backend/src/services/landRegistry.ts`. The frontend never constructs or transmits query fragments.

---

## 10. Acceptance criteria status (§14)

### §14.1 Search and retrieval
- ✅ Full postcode returns paginated transactions and unique properties
- ✅ Partial postcode and street perform bounded retrieval and enforce caps
- ✅ Explicit `isPartialResult` and `capsTriggered` flags returned
- ✅ Refinement prompt shown when cap is hit

### §14.2 Metrics correctness
- ✅ All five metrics computed for properties with ≥2 transactions
- ✅ PRD §13 worked example verified (see §5 above)

### §14.3 Grouping
- ✅ Group by postcode unit, sector, district, property type, building/street
- ✅ Group metrics aggregated from per-property changes (not raw transaction averages)

### §14.4 Provenance and compliance
- ✅ Each transaction row includes the Land Registry linked data URI (clickable "View record ↗" link)
- ✅ HM Land Registry attribution and OGL v3 licensing notice in footer
