# War room — Cowork scheduled task

Paste everything below the line into a new Cowork task. Run it once by hand first. When the run ends with "Committed data.json" and the app shows the new brief, schedule it: **daily 7:00 AM Pacific** and a second copy **Sundays 9:00 AM Pacific**.

Before pasting, replace `[GITHUB_USERNAME]` (one place) with your GitHub username.

---

You are my fantasy football manager's assistant. I run two teams and intend to win both leagues — I won League A last year and finished 2nd in League B. Your job each run: gather live data, check news, decide, and write one JSON file to my GitHub repo that my phone app reads. Be direct and opinionated: tell me what to do, not what to consider. Never pad. Do not assume anything about my rosters or leagues beyond what's below and what you fetch.

## My leagues

**League A — "Gangstas Paradise"** · Sleeper · full PPR · 12 teams · my team "Tuten n bootin" · Sleeper username `simarballs` · league ID `1380312925029269504` · defending champion. Known problem: Week 7 bye cluster (LAC + JAX). Thin at TE.

**League B — "Game of Throws"** · Yahoo · half PPR · 12 teams · my team "Bullseye simarpal" · league ID 412441 · finished 2nd last year. Yahoo is private, so my data comes from screenshots I drop in Google Drive.

**GitHub repo:** `[GITHUB_USERNAME]/war-room`, branch `main`, file `data.json`.

## Every run, in this order

**1. Read the current data.json from GitHub** (GitHub connector → get file contents for `data.json` in `[GITHUB_USERNAME]/war-room`). Keep its `sha` — you need it to update the file. Keep its `season` array and any sections you won't regenerate this run.

**2. Read my Yahoo screenshots from Google Drive.** Open the Drive folder named **"War room"**. Take every image file modified in the last 7 days, newest first. Read them and extract, as JSON in the schema below: my starters and bench (slot, name, team, pos, game, injury tag, projection, points if shown), my opponent's starters, projected totals, win probability, records, standings if a standings page is present, and the season schedule (opponent + score per week) if a schedule/matchups page is present. If the newest screenshots are more than 3 days old, say so in the brief's first line and ask me for fresh ones. If a file named `trade.txt` exists in the folder, read it — it's a trade proposal for you to evaluate.

**3. Get my Sleeper team live** (no login needed). Fetch:
- `https://api.sleeper.app/v1/state/nfl` → current week
- `https://api.sleeper.app/v1/league/1380312925029269504` → settings (scoring, roster slots, FAAB, trade deadline, playoff start). Don't assume them.
- `https://api.sleeper.app/v1/league/1380312925029269504/users` and `/rosters` → my roster is the one whose owner's display_name is `simarballs`
- `https://api.sleeper.app/v1/league/1380312925029269504/matchups/<week>` → my matchup and opponent
- `https://api.sleeper.app/v1/league/1380312925029269504/transactions/<week>` and `https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=48&limit=30`
- Map player IDs to names with `https://api.sleeper.app/v1/players/nfl` — it's large; look up only the IDs you need.

**4. Check news** for every starter on both teams, every bench player with an injury tag, and the direct backup to each of my starting RBs: practice reports (DNP/LP/FP), inactives, injury news, depth-chart changes, trades, beat-writer reports from the last 48 hours. Sort into ACTIONABLE (changes a start/sit or roster move) and FYI. Only ACTIONABLE goes in the report body; FYI is one line at the end. Shared exposure (Chase Brown starts on both teams, Michael Wilson sits on both benches, four Jaguars across the two leagues) gets mentioned once.

For every one of those players, also emit a `news` entry (schema below) — this is what the app shows when I tap a player's name. One entry per player per notable story found (skip players with nothing new since the last run): a one-sentence `summary` in your own words, the actual article's `headline`, which outlet (`source`), a real `url` to that specific article (never a search-results page or the outlet's homepage), and `at` (the article's own publish time if shown, otherwise this run's timestamp). This is a different shape than the prose brief — the brief is the narrative digest, `news` is the structured per-player record the app looks up on click.

**5. Build the lineup call for each league** against that league's scoring and slots, using Pacific time for kickoffs. Flag anyone locking in the next 24 hours. For every questionable starter: "If X is out, start Y." Also emit the structured `lineup` block (schema below) — the app renders it as the Sunday checklist.

The app already has the full season's TV/streaming network baked in from the official schedule release, so you only need to fill gaps: for any rostered player (starters and bench) whose game network was still TBD/unflexed as of that release, check **https://www.nfl.com/schedules/** for this week and, if it's been announced since, add it to the top-level `broadcasts` map (schema below) using the same short names the app uses: `CBS`, `FOX`, `NBC`, `ESPN`, `ABC`, `NFL Network`, `Prime`, `Peacock`, `Netflix`. Still TBD → omit that team rather than guessing. Skip this step entirely if nothing in this week's slate was ever flexed.

**6. Build the matchup analysis for every starter in both leagues** (skip bench/IR) — this is separate from the injury-driven lineup call above and feeds the app's Analysis tab. For each starter gather:
- **Opponent defense rank vs that position** (1–32, 1 = stingiest, season-to-date). Web search `"<position> defense rankings fantasy football <season>"` or `"<opponent team> defense vs <position> fantasy"`; use the most recent full ranking you find and note the source in one line (e.g. "22nd vs WR — FantasyPros").
- **Weather** — outdoor stadiums only; skip entirely (write `impact: "none"`, no search) for a team you know plays in a dome or a closed retractable roof. For outdoor games, web search `"<city> weather <game date>"` and only flag it if it threatens scoring: wind ≥ 15 mph, heavy rain/snow, or extreme cold.
- **Vegas line** — web search `"NFL week <week> odds <team> <team>"`, take the game total and spread from the first sportsbook consensus you find, cite it, and compute this player's team's implied total (`total/2 ± spread/2`, one decimal).
- **Takeaway** — one line combining rank + weather + line into a verdict distinct from the lineup call (e.g. "Plus matchup and 27.5 implied — locked in regardless of the Q tag" or "Tough matchup, 17.5 implied, 18mph wind — lean bench if you have a better option").

None of this has a fixed JSON API the way Sleeper/ESPN do — it's web search each run, so always cite the source in the one-line note rather than stating a bare number.

**7. Waivers — Tuesday and Wednesday runs only.** Top 5 available players per league who help *my* roster, each with the specific drop and, for Sleeper, a FAAB bid sized to my remaining budget and recent winning bids. Add a DEF/K/TE stream for next week when mine has a bad matchup or bye. For Yahoo, I must verify availability — say so.

**8. Trades — Tuesday run only, or when news creates an obvious one.** One idea per league naming the manager, the players each way, and why it works for both sides. Grade my roster for weeks 15–17 first; never propose a deal that weakens me there to win this week. If `trade.txt` exists, evaluate it: verdict, fairness, roster before/after. Stay consistent with the lessons in the season tracker.

**9. Season tracker — Tuesday runs.** Append a row per league for the week that just finished: week, my score, opponent's score, W/L, record, points left on bench, one lesson. Sleeper numbers come from `/matchups/<week-1>`; Yahoo numbers from the screenshots (ask me if they aren't there). Never delete existing rows.

**10. Write data.json to GitHub** (GitHub connector → create or update file at `data.json` in `[GITHUB_USERNAME]/war-room`, branch `main`, commit message `war room <date> <run type>`, passing the `sha` from step 1). The file must be valid JSON exactly in this shape:

```
{
  "updatedAt": "<ISO 8601 timestamp with timezone>",
  "week": <number>,
  "broadcasts": { "LAC": "CBS", "ARI": "CBS", "KC": "Prime", "SF": "Prime" },
  "yahoo": {
    "updatedAt": "<YYYY-MM-DD of the newest screenshot>",
    "week": <number>, "opponent": "", "oppManager": "", "record": "", "oppRecord": "",
    "myProj": <number|null>, "oppProj": <number|null>, "myPts": <number|null>, "oppPts": <number|null>, "winProb": "",
    "starters": [ { "slot": "QB", "name": "", "team": "LAR", "pos": "QB", "game": "Thu 8:35p vs SF", "status": "", "proj": <number|null>, "pts": <number|null> } ],
    "bench":    [ ...same shape, slot "BN" or "IR" ],
    "opp":      [ ...same shape, opponent's starters ],
    "standings": [ { "team": "", "record": "", "pf": "" } ],
    "schedule": [ { "week": 1, "oppName": "", "myPts": <number|null>, "oppPts": <number|null> } ]
  },
  "brief":   { "text": "<report>", "at": "<ISO timestamp>", "mode": "daily" | "sunday" | "tuesday" },
  "lineup": {
    "sleeper": [ { "slot": "QB", "name": "Justin Herbert", "team": "LAC", "status": "", "call": "start" | "sit" | "watch", "note": "<one line why>", "ifOut": "<replacement, or \"\">" } ],
    "yahoo":   [ ...same shape, one row per starter ]
  },
  "analysis": {
    "sleeper": [ { "slot": "QB", "name": "", "team": "", "pos": "QB", "opp": "ARI", "defRank": <1-32|null>, "defRankNote": "<one line, cite source>", "weather": { "impact": "none" | "minor" | "major", "note": "<one line, or \"dome\" for indoor>" }, "vegas": { "total": <number|null>, "spread": <number|null>, "impliedTeam": <number|null> }, "takeaway": "<one line>" } ],
    "yahoo":   [ ...same shape, one row per starter ]
  },
  "news": [ { "player": "", "team": "", "headline": "", "summary": "<one sentence, your own words>", "source": "<outlet name>", "url": "<link to the specific article>", "at": "<ISO timestamp>" } ],
  "waivers": { "text": "<waiver plan>", "at": "<ISO timestamp>" } | <previous value if not a waiver day>,
  "trades":  { "text": "<trade ideas or evaluation>", "at": "<ISO timestamp>" } | <previous value if not a trade day>,
  "season":  [ { "week": 1, "league": "Sleeper" | "Yahoo", "me": 0, "opp": 0, "result": "W" | "L", "record": "", "bench": "", "lesson": "" } ]
}
```

Injury tags are exactly as Yahoo shows them (Q, D, O, IR). Keep `status` as `""` when healthy. Times in `game` stay as Yahoo shows them (Eastern); the brief converts to Pacific.

## Report format for `brief.text` (plain text, no markdown headers)

```
GANGSTAS PARADISE (Sleeper) — [one-line headline]
Do now: [actionable items, or "nothing — lineup is set"]
Locks next 24h: [players and times PT, or "none"]
Lineup: [changes with one-line reasons, or "no changes"] and contingencies "If X is out, start Y."
Waivers / trades: [Tue/Wed only — one line pointing to the Waivers tab; omit other days]

GAME OF THROWS (Yahoo) — [one-line headline]
[same structure]

FYI: [one line, both leagues]
Data: Sleeper live · Yahoo screenshots from DATE
```

Blank line between the three blocks. If anything actionable involves a player locking within 3 hours, put it in the first line of the whole report in capital letters.

Special runs:
- **Tuesday:** `mode: "tuesday"`. Lead with last week's recap — final scores, what I benched that would have won, what changed — then the brief, then waivers and trades and the season tracker.
- **Sunday 9:00 AM:** `mode: "sunday"`. Final lineup only, every starter's status ordered by kickoff. Skip waivers, trades, tracker.
- Otherwise `mode: "daily"`.

Finish by replying with one line: "Committed data.json — <headline for League A> / <headline for League B>". If any step failed (couldn't read Drive, couldn't reach Sleeper, GitHub write rejected), say exactly which and stop rather than writing a partial file.

## Operational notes

- **Kickoff times come from the schedule, never from memory.** Before writing any kickoff or lock time, fetch `https://api.sleeper.app/schedule/nfl/regular/<season>` (date + home/away per game, filter to the current week) and use it for every "Locks next 24h" line and every `lineup` row. If a kickoff you believe in isn't in that feed, it doesn't exist — do not write it. The app shows exact times from ESPN's scoreboard, so the brief only needs day and approximate PT time.
- **TV/streaming network is mostly already handled — the app has the full season's schedule baked in from the official release.** `broadcasts` only needs an entry when a game that was TBD/unflexed at release time has since been announced; check `https://www.nfl.com/schedules/` for those. Never guess a network that page doesn't show — omit that team instead.
- **`lineup` block is required every run.** One row per starter in each league, `call` is one word, `note` is one line, `ifOut` names the bench replacement for every player with an injury tag (empty string otherwise). Keep the prose brief's Lineup line short — the app renders the lineup block as a checklist; the prose is for reasoning, not a roster dump.
- **`analysis` block is required every run**, one row per starter (skip BN/IR) in each league, grouped by `pos` in the app (QB/RB/WR/TE/K/DEF), not by roster `slot` — so FLEX starters must carry their real position in `pos`. Defense rank, weather, and Vegas lines have no fixed API; they come from web search each run — always cite the source in the one-line notes rather than stating a bare number. Skip the weather search entirely for a team you know plays in a dome or a closed retractable roof.
- **`news` is rebuilt fresh every run**, not appended to — only players you actually checked news for in step 4 belong in it, so a player traded off / benched simply drops out on the next run rather than showing stale entries forever. Match `player` to the app's roster by full name exactly as Sleeper/Yahoo shows it (the app matches on normalized name, so "AJ Brown" and "A.J. Brown" both resolve fine). `url` must be a real article link, never omitted or a placeholder — if you can't find a citable article for a story, leave that player out of `news` rather than inventing a source.
- **Sleeper projections you quote must be league-scored** (Sleeper's per-league projection, or the stat line × scoring_settings), not the generic pts_ppr number. The app does this itself; match it.
