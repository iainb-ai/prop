# UK Property Price History Analyser – Setup Guide for Beginners

## Overview

By the end of this guide the app will be running on your Windows PC and open in your web browser at **http://localhost:5173**. You need about 1 hour of hands-on time, plus a few hours of waiting while the app builds its database the first time.

The app searches HM Land Registry house-sale records (every sale in England and Wales since 1995) by postcode or street, and shows price history and growth for each property. It runs entirely on your own PC; nothing is sent to the internet.

**Before you start, check you have:**

- Windows 10 or 11 with an administrator account (you will install software)
- **At least 50 GB of free disk space**: the data file is about 5 GB and the database the app builds is about 18 GB, with working space on top
- 16 GB of memory (RAM) is recommended; 8 GB works but searches are slower
- A reliable internet connection for the downloads

**How to read this guide:** text in a grey box like `npm run dev` is a command. You type it (or copy and paste it) into a terminal window and press **Enter**. Do the steps in order; each one relies on the one before.

## Step 1: Install the tools

Install these five programs in this order. For each one, accept the installer's default options unless a step below says otherwise. Restart your PC once at the end.

| # | Program | What it is for | Download |
| --- | --- | --- | --- |
| 1 | Git | Downloads the code and keeps it up to date | [git-scm.com/download/win](https://git-scm.com/download/win) |
| 2 | Node.js 24 (LTS) | Runs the app | [nodejs.org](https://nodejs.org/en/download) |
| 3 | Python 3.12 or newer | Needed to build the database driver if a ready-made one isn't available; also runs the optional rent-vs-buy tool | [python.org/downloads](https://www.python.org/downloads/) |
| 4 | Visual Studio Build Tools | The C++ compiler the database driver may need | [visualstudio.microsoft.com/downloads](https://visualstudio.microsoft.com/downloads/) |
| 5 | Visual Studio Code | A free editor for viewing the code and running commands | [code.visualstudio.com](https://code.visualstudio.com/) |

**1. Git.** Run the installer and click **Next** through every screen.

**2. Node.js.** Download the **Windows Installer (.msi)** for version 24 (LTS). On the screen titled *Tools for Native Modules*, **tick the box** "Automatically install the necessary tools". This installs Python and the Visual Studio Build Tools for you; if a black window opens afterwards and asks you to press a key, let it finish (it can take 10–20 minutes). If that worked, you can skip items 3 and 4.

**3. Python** (only if you didn't tick the box in step 2). On the first installer screen, **tick "Add python.exe to PATH"** before clicking *Install Now*. Missing this box is the most common setup mistake.

**4. Visual Studio Build Tools** (only if you didn't tick the box in step 2). Scroll down the downloads page to *Tools for Visual Studio* and download **Build Tools for Visual Studio**. When the installer opens, tick **Desktop development with C++** and click **Install** (about 7 GB). This is not the same as Visual Studio Code.

**5. Visual Studio Code.** Run the installer and tick **Add "Open with Code" action** when offered.

**Check it worked.** Restart your PC. Open the Start menu, type **PowerShell** and open *Windows PowerShell*. Type each command below and press Enter. Each one should print a version number; if one says *not recognized*, reinstall that program.

```
git --version
node --version
npm --version
python --version
```

`node --version` should start with **v24**.

## Step 2: Download the code

The code lives on GitHub at [github.com/iainb-ai/prop](https://github.com/iainb-ai/prop). It is public, so you don't need a GitHub account to download it. "Cloning" means copying it to your PC with Git, so you can fetch updates later with one command.

1. Open **Windows PowerShell** (Start menu → type PowerShell).
2. Go to your Documents folder:

    ```
    cd $HOME\Documents
    ```

3. Copy the code into a new folder called `prop`:

    ```
    git clone https://github.com/iainb-ai/prop.git
    ```

4. Move into that folder. Every later command in this guide is run from here:

    ```
    cd prop
    ```

You now have a folder `Documents\prop` containing the code. To browse it, open Visual Studio Code, choose **File → Open Folder** and pick that folder. VS Code also has a built-in terminal (**Terminal → New Terminal**) that already starts in the right folder; you can use it instead of PowerShell for every step below.

## Step 3: Install the app's libraries

The app is built on dozens of free libraries that aren't stored in the repo. Two commands download them; you only need to do this once (and again if *Day-to-day use* tells you to).

In PowerShell, inside the `prop` folder, run:

```
npm install
npm run install:all
```

This takes 2–5 minutes and prints a lot of text. Yellow `WARN` lines are normal. It has worked if it ends without a red `ERR!` line.

If you see an error mentioning **better-sqlite3**, **node-gyp**, **Python** or **Visual Studio**, the database driver couldn't be installed. Go back to Step 1 and make sure Python and the *Desktop development with C++* build tools are installed, restart, then run the two commands again.

## Step 4: Download the house-price data

The data isn't in the repo because it is too big (5.3 GB). You download it once from HM Land Registry and put it in the `prop` folder with a specific name.

1. In your browser, open the [Price Paid Data single file page](https://www.gov.uk/government/statistical-data-sets/price-paid-data-single-file).
2. Click **the complete Price Paid Transaction Data as a CSV file** (5.3 GB, file name `pp-complete.csv`). Make sure you pick the **CSV**, not the text file. The download can take 20–60 minutes.
3. When it has finished, move the file from your *Downloads* folder into `Documents\prop`.
4. **Rename it** from `pp-complete.csv` to exactly **`pp-fulldata.csv`**. The app looks for that name.

    If Windows hides file extensions, the file may show as just `pp-complete`. In that case rename it to `pp-fulldata` (Windows keeps the `.csv` part).

Alternatively, run this in PowerShell from the `prop` folder to download and name it in one go:

```
curl.exe -L -o pp-fulldata.csv https://price-paid-data.publicdata.landregistry.gov.uk/pp-complete.csv
```

The file is listed in `.gitignore`, so Git will never try to upload it.

## Step 5: Start the app

The first start builds the database from the data file, which takes a few hours. Later starts take under a minute.

1. In PowerShell, inside the `prop` folder, run:

    ```
    npm run dev
    ```

2. Wait until you see two lines like these (green for `backend`, blue for `frontend`):

    ```
    [backend]  [server] Backend running on http://localhost:3001
    [frontend]   ➜  Local:   http://localhost:5173/
    ```

3. Open your web browser and go to **http://localhost:5173**.
4. The first time, the page shows a progress screen while it imports about 31 million sales and builds search indexes. **Leave the PowerShell window open** and let the PC stay awake (turn off sleep in *Settings → System → Power*) until it finishes. Expect 1–3 hours depending on your PC.
5. When the search box appears, try a postcode such as `SW19 1JU`. The header shows the date of the latest sale in the data.

For a while after the first build, the app keeps optimising in the background. Searches work during this time but are slower; the log shows *Optimisation complete* when it's done.

The database is saved to `data\pp-data.sqlite` (about 18 GB), so you never need to rebuild it. Once it exists, you can delete `pp-fulldata.csv` to free 5 GB if you need the space.

**To stop the app**, click in the PowerShell window and press **Ctrl + C** (press **Y** and Enter if asked). Closing the window also stops it.

## Day-to-day use

**Starting the app each time.** Open PowerShell and run:

```
cd $HOME\Documents\prop
npm run dev
```

Then open **http://localhost:5173**. Stop it with **Ctrl + C**.

**Getting the latest code.** When the code on GitHub has changed, stop the app, then run:

```
git pull
npm run install:all
```

`git pull` downloads the changes; `npm run install:all` picks up any new libraries (it's quick if nothing changed). Then start the app as normal. Your database and data file are not affected.

**Adding the latest month of sales.** Land Registry publishes new data on the 20th working day of each month. You don't need to download the 5 GB file again:

1. On the [Price Paid Data downloads page](https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads), open the latest month's page and download **current month as a CSV file** (about 18 MB, named `pp-monthly-update-new-version.csv`).
2. In the app, click **Update Dataset** (top right) and choose that file.
3. Wait for the progress bar to finish. The header's *latest transaction* date updates when you close the window.

Apply each month's file once, in order. If you've missed several months, apply each one from oldest to newest.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `npm` / `git` / `node` *is not recognized* | Restart the PC so Windows picks up the new programs. If it persists, reinstall that program (Step 1). |
| *running scripts is disabled on this system* when running `npm` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` in PowerShell, answer **Y**, then try again. |
| Errors mentioning `better-sqlite3`, `node-gyp`, Python or Visual Studio during Step 3 | Install Python (with *Add to PATH* ticked) and the *Desktop development with C++* build tools, restart, and rerun Step 3. |
| Page says *CSV file not found* | The data file is missing or misnamed. It must be `Documents\prop\pp-fulldata.csv` (Step 4). |
| `EADDRINUSE` or *port 3001 / 5173 already in use* | The app is already running in another window. Close that window, or restart the PC. |
| *Could not open database* | Another copy of the app is running. Close every PowerShell window running it and start again. |
| The browser shows *This site can't be reached* | The app isn't running. Check the PowerShell window is still open and showing no errors, then reload. |
| A search runs for a long time and the app stops responding | Searches by street name alone scan all 31 million sales. Include a postcode, e.g. `HIGH STREET, SW19`. If it's stuck, press **Ctrl + C** and run `npm run dev` again. |
| The first-time build was interrupted (PC slept or restarted) | Just run `npm run dev` again. It detects the incomplete build and starts it over. |

Still stuck? Copy the last 20 or so lines from the PowerShell window and send them to the project owner.
