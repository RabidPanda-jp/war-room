# War room — setup (about 20 minutes, once)

Three pieces: a GitHub page that hosts the app, a Google Drive folder you drop Yahoo screenshots into, and a Claude scheduled task that connects them.

## 1. GitHub — host the app (10 min)

1. Go to github.com → **Sign up**. Email, password, username. Pick a username you're fine seeing in a web address.
2. After signing in, click the **+** at the top right → **New repository**.
   - Repository name: `war-room`
   - Leave it **Public** (required for the free web hosting)
   - Tick **Add a README file**
   - Click **Create repository**
3. On the repo page click **Add file → Upload files**. Drag in `index.html` and `data.json` from the `war-room-site` folder you downloaded. Click **Commit changes**.
4. Click **Settings** (top of the repo) → **Pages** (left sidebar). Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main** / **/(root)**, click **Save**.
5. Wait a minute, reload that Pages screen, and it shows your address: `https://YOUR-USERNAME.github.io/war-room/`. Open it — you should see the app with today's Sleeper matchup and the Yahoo data from your Sep 5 screenshots.
6. On your phone, open that address in Safari or Chrome → Share → **Add to Home Screen**. Same on the laptop if you like (Chrome: Install app).

You never touch GitHub again after this. The scheduled task writes to it for you.

## 2. Google Drive — where screenshots go (1 min)

In Google Drive, make a folder named exactly **War room**. That's it. Each time you want fresh Yahoo data — at minimum Sunday morning before 9 — screenshot your Yahoo roster page and matchup page and save them into that folder from your phone's share sheet. Optional: a screenshot of the Standings page fills the League tab, a screenshot of the schedule/matchups page fills the season schedule menu; a text file named `trade.txt` gets a trade proposal evaluated.

## 3. Claude — connect GitHub and schedule the task (5 min)

1. In Claude (web or desktop): Settings → **Connectors** → find **GitHub** → **Connect** → sign in and click Authorize. One click, no token copying. Google Drive is already connected.
2. Open Claude Desktop → **Cowork** → **New task**. Open `cowork-task-prompt.md`, replace `[GITHUB_USERNAME]` with your GitHub username, paste the whole thing in, and send it.
3. Watch the first run. It should end with "Committed data.json — …". Refresh the app: the brief timestamp at the top changes to now.
   - If it stops on a permissions question about Drive or GitHub, approve it with **Always allow** — that's the one known rough edge with scheduled runs.
   - If it says the GitHub write was rejected, tell me the exact message.
4. When the manual run works, type `/schedule` in that same task and set it to **daily at 7:00 AM Pacific**. Then make a second scheduled task with the same prompt for **Sundays at 9:00 AM Pacific**.

Scheduled tasks run in the cloud — your computer can be asleep. You can also run either task on demand from the **Scheduled** panel in the sidebar whenever news breaks.

## Every week, what you actually do

- Sunday morning (before 9): screenshot Yahoo roster + matchup into the Drive folder.
- Tuesday: same, plus the Yahoo final-score screenshot so the season tracker has it.
- Open the app whenever. That's it.
