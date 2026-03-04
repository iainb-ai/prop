# UK Property Price History Analyser

MVP implementation of the UK Property Price History Analyzer PRD.

## Quick start

```bash
# 1. Install all dependencies
npm run install:all

# 2. Start backend + frontend together
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001

## Project structure

```
prop/
├── backend/          Node.js + Express + TypeScript API
│   └── src/
│       ├── server.ts
│       ├── routes/search.ts
│       └── services/
│           ├── landRegistry.ts   HM Land Registry LDA client
│           ├── metrics.ts        PRD Section 9 formulas
│           └── cache.ts          24h / 6h in-memory cache
└── frontend/         React + Vite + Tailwind + Recharts
    └── src/
        ├── App.tsx
        ├── components/
        │   ├── SearchForm.tsx
        │   ├── ResultsOverview.tsx
        │   ├── PropertyList.tsx
        │   ├── PropertyDetail.tsx  (price history chart)
        │   ├── GroupTable.tsx      (bar chart + table)
        │   ├── TransactionChart.tsx
        │   └── MetricBadge.tsx
        └── utils/
            ├── export.ts   CSV downloads
            └── format.ts   GBP / % / date formatting
```

## Search formats

| Input | Example | Behaviour |
|-------|---------|-----------|
| Full postcode | `SW11 1AD` | Exact match query |
| Partial postcode | `SW11` or `SW11 1` | Prefix SPARQL filter |
| Street + qualifier | `ST JOHNS HILL, SW11` | Street exact + postcode prefix |

## Attribution

Contains HM Land Registry data © Crown copyright and database right 2025.
Licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
