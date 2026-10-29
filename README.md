# UK Property Price History Analyser

**New to this project?** Follow [SETUP.md](SETUP.md) for step-by-step instructions to install the tools, download the code and data, and run the app on Windows.

## How to Start the App

### First-time setup (do this once)

1. Open a terminal (PowerShell or Command Prompt) in the project folder
2. Run: `npm run install:all`
3. Wait for it to finish — this downloads all the required software

---

### Starting the app

1. Open a terminal in the project folder
2. Run: `npm run dev`
3. Wait until you see messages confirming both the backend and frontend have started
4. Open your browser and go to: **http://localhost:5173**

---

### Using the app

1. **Download your data** — Go to https://landregistry.data.gov.uk/app/ppd/ppd_data and download a CSV file of Price Paid Data
2. **Upload the CSV** — On the app's home screen, drag and drop (or browse for) the CSV file you downloaded
3. **Search** — Once uploaded, use the search box to look up properties by postcode or street name
4. **Export results** — You can download the results as a CSV using the export buttons

---

### Stopping the app

Press `Ctrl + C` in the terminal window where the app is running.

---

**Note:** The uploaded data is only stored temporarily (for 4 hours). You will need to re-upload the CSV file if you start a new session or if it has been more than 4 hours.
