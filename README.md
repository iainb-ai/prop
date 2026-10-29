# UK Property Price History Analyser

Search HM Land Registry Price Paid Data (every residential sale in England and Wales since 1995) by postcode or street, and see price history, growth (CAGR) and market trends for each property. Everything runs locally; the data lives in a SQLite database on your PC.

**New to this project?** Follow [SETUP.md](SETUP.md) for step-by-step instructions (Windows and Mac) to install the tools, download the code and data, and run the app.

## Quick start

Requires Node.js 24, Git, and about 50 GB of free disk space.

```
git clone https://github.com/iainb-ai/prop.git
cd prop
npm install
npm run install:all
```

Download the complete Price Paid Data CSV (`pp-complete.csv`, 5.3 GB) from the [Land Registry single file page](https://www.gov.uk/government/statistical-data-sets/price-paid-data-single-file), save it in the repo root and rename it to `pp-fulldata.csv`. Then:

```
npm run dev
```

Open **http://localhost:5173**. The first start imports the CSV into `data/pp-data.sqlite` (about 18 GB), which takes a few hours; later starts open the existing database in under a minute. Stop the app with `Ctrl + C`.

## Using the app

- **Search** by full postcode (`SW19 1JU`), sector or district (`SW19 1`, `SW19`), or street within a postcode (`HIGH STREET, SW19`). Street-only searches scan the whole dataset and are slow.
- **Latest transaction** date in the header shows how up to date the data is.
- **Update Dataset** applies a monthly update file (`pp-monthly-update-new-version.csv`, from the [downloads page](https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads)). Apply each month once, oldest first. Updates are stored in the database and kept across restarts.
- **Export** property metrics, transactions or group summaries as CSV.

## Project layout

| Path | Contents |
| --- | --- |
| `backend/` | Express + TypeScript API on port 3001 (SQLite via better-sqlite3) |
| `frontend/` | React + Vite + Tailwind UI on port 5173 (proxies `/api` to the backend) |
| `rent_vs_buy/` | Standalone Python rent-vs-buy model (`python -m rent_vs_buy.main`) |
| `data/` | Generated SQLite database (not in git) |
| `pp-fulldata.csv` | Land Registry source data (not in git) |

The database is built from `pp-fulldata.csv` only when `data/pp-data.sqlite` doesn't exist. To rebuild from a newer full CSV, stop the app and delete the `data` folder.
