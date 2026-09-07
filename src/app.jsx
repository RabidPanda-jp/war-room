/* Fantasy War Room — one app for two leagues.
   Sleeper: live (league, rosters, matchup, projections, standings, moves, history).
   Yahoo: private league → screenshots read into structured data by the scheduled task.
   data.json (written by the scheduled task): brief / lineup / analysis / waivers / trades / season.
   Source of truth for this file is src/app.jsx — run `npm run build` to regenerate index.html. */

const { useState, useEffect, useMemo, useCallback } = React;

const I = (d, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);
const RefreshCw = ({ size, style }) => (
  <span style={{ display: "inline-flex", ...style }}>
    {I('<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/>', size)}
  </span>
);
const Copy = ({ size }) => I('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>', size);
const Check = ({ size }) => I('<path d="M20 6 9 17l-5-5"/>', size);
const Sun = ({ size }) => I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>', size);
const Moon = ({ size }) => I('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>', size);

const INK = "var(--ink)", OX = "var(--ox)", FLAG = "#F2C037", FIELD = "var(--field)", PAPER = "var(--paper)",
  MUTE = "var(--mute)", LINE = "var(--line)", WIN = "var(--win)", TEXT = "var(--text)", AMBER = "var(--amber)",
  CHIP_BG = "var(--chip-bg)", HAIRLINE = "var(--hairline)", HILITE = "var(--hilite)", FLAG_TEXT = "#1B1F27";
const font = `"Barlow", system-ui, -apple-system, sans-serif`;
const cond = `"Barlow Semi Condensed", "Barlow", system-ui, sans-serif`;

const CONFIG = {
  sleeperLeagueId: "1380312925029269504",
  sleeperUsername: "simarballs",
  sleeperTeamName: "Tuten n bootin",
  yahooLeagueName: "Game of Throws",
  yahooTeamName: "Bullseye simarpal",
};

// Game of Throws scoring expressed in Sleeper stat keys — used to score Sleeper's live stat feed into Yahoo points.
const YAHOO_SCORING = { pass_yd: 0.04, pass_td: 4, pass_int: -1, rush_yd: 0.1, rush_td: 6, rec: 0.5, rec_yd: 0.1, rec_td: 6, st_td: 6, pass_2pt: 2, rush_2pt: 2, rec_2pt: 2, fum_lost: -2, fum_rec_td: 6,
  fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5, xpm: 1,
  sack: 1, int: 2, fum_rec: 2, def_td: 6, safe: 2, blk_kick: 2, def_st_td: 6, def_2pt: 2, pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1, pts_allow_21_27: 0, pts_allow_28_34: -1, pts_allow_35p: -4 };
const YAHOO_RULES = { scoring: "half PPR", waivers: "rolling list, clears Tuesday", tradeDeadline: "Nov 28", playoffs: "weeks 15–17, 6 teams", slots: "QB · 3 WR · 2 RB · TE · W/R/T · K · DEF · 5 BN · IR" };
const LOCK_SOON_MS = 3 * 3600e3;     // "locks soon" threshold
const GAME_LEN_MS = 3.5 * 3600e3;    // treat a game as live for this long after kickoff
const PT = "America/Los_Angeles";

// ---------- small helpers ----------
const fmt = n => (n == null ? "—" : Number(n).toFixed(1));
const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
const stamp = t => t ? new Date(t).toLocaleString("en-US", { timeZone: PT, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const shortName = (name, pos) => {
  if (!name || pos === "DEF") return name || "";
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
};
const kickLabel = at => at ? at.toLocaleString("en-US", { timeZone: PT, weekday: "short", hour: "numeric", minute: "2-digit" }).replace(/,\s/, " ").replace(" AM", "a").replace(" PM", "p") : "";
const rel = ms => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
};
// "Q3 8:42" / "Half" / "OT" style clock for a live game, falling back to a bare "LIVE" if ESPN hasn't given us a clock yet
function liveText(k) {
  if (k.halftime) return "Half";
  if (k.period) {
    const q = k.period <= 4 ? `Q${k.period}` : k.period === 5 ? "OT" : `OT${k.period - 4}`;
    return k.clock ? `${q} ${k.clock}` : q;
  }
  return "LIVE";
}
// game state for a player row given a kickoff map and "now"
function gameState(kick, team, now) {
  const k = kick?.[team];
  if (!k) return { phase: "unknown", text: "" };
  const base = { opp: k.opp, home: k.home, tv: k.tv, myScore: k.myScore, oppScore: k.oppScore };
  const dt = k.at.getTime() - now;
  if (dt > 24 * 3600e3) return { ...base, phase: "pre", at: k.at, text: kickLabel(k.at) };
  if (dt > 0 && k.state !== "in" && k.state !== "post") return { ...base, phase: dt < LOCK_SOON_MS ? "soon" : "pre", at: k.at, text: `in ${rel(dt)}`, soon: dt < LOCK_SOON_MS };
  if (k.state === "post" || (!k.state && -dt >= GAME_LEN_MS)) {
    const score = k.myScore != null && k.oppScore != null ? ` ${k.myScore}-${k.oppScore}` : "";
    return { ...base, phase: "final", at: k.at, text: `FINAL${score}` };
  }
  return { ...base, phase: "live", at: k.at, text: liveText(k) };
}
const started = g => g?.phase === "live" || g?.phase === "final";
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- data.json ----------
const DATA_URL = new URLSearchParams(location.search).get("data") || "data.json";
async function loadData() {
  const r = await fetch(`${DATA_URL}${DATA_URL.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 404 ? "No data.json next to the app yet — the scheduled task hasn't written one." : `data.json: HTTP ${r.status}`);
  return r.json();
}

// ---------- schedule / kickoffs ----------
// Full-season TV/streaming schedule, straight off the NFL's official release — the network per game is set
// months ahead, so there's no need to guess at it from ESPN's undocumented broadcast JSON. Rows are
// [week, away, home, network]; network is null for games not yet flexed/announced (mostly weeks 16-18).
const NETWORK_SCHEDULE_ROWS = [
  [1,"NE","SEA","NBC"],[1,"SF","LAR","Netflix"],[1,"CHI","CAR","FOX"],[1,"TB","CIN","FOX"],
  [1,"NO","DET","FOX"],[1,"ATL","PIT","FOX"],[1,"BUF","HOU","CBS"],[1,"BAL","IND","CBS"],
  [1,"CLE","JAX","CBS"],[1,"NYJ","TEN","CBS"],[1,"ARI","LAC","CBS"],[1,"GB","MIN","CBS"],
  [1,"MIA","LV","FOX"],[1,"WAS","PHI","FOX"],[1,"DAL","NYG","NBC"],[1,"DEN","KC","ESPN"],
  [2,"DET","BUF","Prime"],[2,"CAR","ATL","FOX"],[2,"NO","BAL","CBS"],[2,"MIN","CHI","FOX"],
  [2,"CIN","HOU","CBS"],[2,"PIT","NE","CBS"],[2,"GB","NYJ","FOX"],[2,"CLE","TB","CBS"],
  [2,"PHI","TEN","FOX"],[2,"JAX","DEN","CBS"],[2,"LV","LAC","CBS"],[2,"SEA","ARI","FOX"],
  [2,"WAS","DAL","FOX"],[2,"MIA","SF","FOX"],[2,"IND","KC","NBC"],[2,"NYG","LAR","ESPN"],
  [3,"ATL","GB","Prime"],[3,"LAC","BUF","FOX"],[3,"CAR","CLE","FOX"],[3,"NYJ","DET","FOX"],
  [3,"HOU","IND","CBS"],[3,"NE","JAX","CBS"],[3,"KC","MIA","CBS"],[3,"TEN","NYG","CBS"],
  [3,"CIN","PIT","CBS"],[3,"SEA","WAS","FOX"],[3,"ARI","SF","FOX"],[3,"MIN","TB","FOX"],
  [3,"LV","NO","CBS"],[3,"BAL","DAL","CBS"],[3,"LAR","DEN","NBC"],[3,"PHI","CHI","ESPN"],
  [4,"PIT","CLE","Prime"],[4,"IND","WAS","NFL Network"],[4,"TEN","BAL","CBS"],[4,"NE","BUF","CBS"],
  [4,"NYJ","CHI","FOX"],[4,"JAX","CIN","CBS"],[4,"DAL","HOU","FOX"],[4,"ARI","NYG","CBS"],
  [4,"LAR","PHI","FOX"],[4,"GB","TB","FOX"],[4,"MIA","MIN","FOX"],[4,"KC","LV","CBS"],
  [4,"LAC","SEA","CBS"],[4,"DEN","SF","CBS"],[4,"DET","CAR","NBC"],[4,"ATL","NO","ESPN"],
  [5,"TB","DAL","Prime"],[5,"PHI","JAX","NFL Network"],[5,"CIN","MIA","FOX"],[5,"LV","NE","CBS"],
  [5,"MIN","NO","FOX"],[5,"CLE","NYJ","CBS"],[5,"IND","PIT","CBS"],[5,"HOU","TEN","CBS"],
  [5,"NYG","WAS","FOX"],[5,"DEN","LAC","CBS"],[5,"DET","ARI","FOX"],[5,"CHI","GB","FOX"],
  [5,"SF","SEA","FOX"],[5,"BAL","ATL","NBC"],[5,"BUF","LAR","ESPN"],
  [6,"SEA","DEN","Prime"],[6,"HOU","JAX","NFL Network"],[6,"CHI","ATL","FOX"],[6,"BAL","CLE","FOX"],
  [6,"TEN","IND","FOX"],[6,"NYJ","NE","CBS"],[6,"NO","NYG","FOX"],[6,"CAR","PHI","CBS"],
  [6,"PIT","TB","CBS"],[6,"ARI","LAR","FOX"],[6,"LAC","KC","CBS"],[6,"BUF","LV","CBS"],
  [6,"DAL","GB","NBC"],[6,"WAS","SF","ESPN"],
  [7,"NE","CHI","Prime"],[7,"PIT","NO","NFL Network"],[7,"SF","ATL","FOX"],[7,"CIN","BAL","CBS"],
  [7,"TB","CAR","FOX"],[7,"NYG","HOU","FOX"],[7,"IND","MIN","CBS"],[7,"MIA","NYJ","CBS"],
  [7,"CLE","TEN","CBS"],[7,"DEN","ARI","CBS"],[7,"GB","DET","FOX"],[7,"LAR","LV","FOX"],
  [7,"KC","SEA","NBC"],[7,"DAL","PHI","ESPN"],
  [8,"CAR","GB","Prime"],[8,"BAL","BUF","CBS"],[8,"TEN","CIN","CBS"],[8,"ARI","DAL","FOX"],
  [8,"MIN","DET","FOX"],[8,"IND","JAX","CBS"],[8,"LV","NYJ","FOX"],[8,"CLE","PIT","CBS"],
  [8,"ATL","TB","FOX"],[8,"LAC","LAR","FOX"],[8,"KC","DEN","CBS"],[8,"NE","MIA","CBS"],
  [8,"PHI","WAS","NBC"],[8,"CHI","SEA","ESPN"],
  [9,"JAX","BAL","Prime"],[9,"CIN","ATL","NFL Network"],[9,"DEN","CAR","CBS"],[9,"DAL","IND","FOX"],
  [9,"NYJ","KC","CBS"],[9,"DET","MIA","FOX"],[9,"CLE","NO","CBS"],[9,"NYG","PHI","FOX"],
  [9,"LAR","WAS","FOX"],[9,"HOU","LAC","CBS"],[9,"LV","SF","CBS"],[9,"GB","NE","FOX"],
  [9,"ARI","SEA","FOX"],[9,"TB","CHI","NBC"],[9,"BUF","MIN","ESPN"],
  [10,"WAS","NYG","Prime"],[10,"NE","DET","FOX"],[10,"KC","ATL","CBS"],[10,"HOU","CLE","FOX"],
  [10,"MIN","GB","FOX"],[10,"MIA","IND","CBS"],[10,"CAR","NO","FOX"],[10,"BUF","NYJ","CBS"],
  [10,"JAX","TEN","FOX"],[10,"LAR","ARI","CBS"],[10,"SEA","LV","CBS"],[10,"SF","DAL","FOX"],
  [10,"PIT","CIN","NBC"],[10,"LAC","BAL","ESPN"],
  [11,"IND","HOU","Prime"],[11,"MIA","BUF","FOX"],[11,"BAL","CAR","FOX"],[11,"NO","CHI","FOX"],
  [11,"TEN","DAL","FOX"],[11,"TB","DET","CBS"],[11,"ARI","KC","CBS"],[11,"JAX","NYG","CBS"],
  [11,"NYJ","LAC","FOX"],[11,"LV","DEN","CBS"],[11,"PIT","PHI","CBS"],[11,"MIN","SF","NBC"],
  [11,"CIN","WAS","ESPN"],
  [12,"GB","LAR","Netflix"],[12,"CHI","DET","CBS"],[12,"PHI","DAL","FOX"],[12,"KC","BUF","NBC"],
  [12,"DEN","PIT","Prime"],[12,"NO","CIN","CBS"],[12,"LV","CLE","FOX"],[12,"BAL","HOU","CBS"],
  [12,"NYG","IND","FOX"],[12,"NYJ","MIA","CBS"],[12,"ATL","MIN","FOX"],[12,"TEN","JAX","CBS"],
  [12,"WAS","ARI","FOX"],[12,"SEA","SF","FOX"],[12,"NE","LAC","NBC"],[12,"CAR","TB","ESPN"],
  [13,"KC","LAR","Prime"],[13,"DET","ATL","CBS"],[13,"JAX","CHI","FOX"],[13,"CIN","CLE","CBS"],
  [13,"GB","NO","FOX"],[13,"SF","NYG","FOX"],[13,"LAC","TB","CBS"],[13,"WAS","TEN","CBS"],
  [13,"PHI","ARI","FOX"],[13,"MIA","DEN","FOX"],[13,"CAR","MIN","CBS"],[13,"BUF","NE","CBS"],
  [13,"HOU","PIT","NBC"],[13,"DAL","SEA","ESPN"],
  [14,"MIN","NE","Prime"],[14,"TB","BAL","FOX"],[14,"NO","CAR","CBS"],[14,"ATL","CLE","CBS"],
  [14,"TEN","DET","FOX"],[14,"CHI","MIA","CBS"],[14,"DEN","NYJ","CBS"],[14,"IND","PHI","FOX"],
  [14,"HOU","WAS","CBS"],[14,"LAC","LV","CBS"],[14,"KC","CIN","FOX"],[14,"NYG","SEA","FOX"],
  [14,"LAR","SF","FOX"],[14,"BUF","GB","NBC"],[14,"PIT","JAX","ESPN"],
  [15,"SF","LAC","Prime"],[15,"SEA","PHI","FOX"],[15,"CHI","BUF","CBS"],[15,"CIN","CAR","FOX"],
  [15,"MIA","GB","FOX"],[15,"JAX","HOU","CBS"],[15,"CLE","NYG","CBS"],[15,"BAL","PIT","CBS"],
  [15,"NO","TB","FOX"],[15,"IND","TEN","CBS"],[15,"ATL","WAS","FOX"],[15,"NYJ","ARI","FOX"],
  [15,"DAL","LAR","CBS"],[15,"DEN","LV","CBS"],[15,"DET","MIN","NBC"],[15,"NE","KC","ESPN"],
  [16,"HOU","PHI","Prime"],[16,"GB","CHI","Netflix"],[16,"BUF","DEN","Netflix"],[16,"LAR","SEA","FOX"],
  [16,"CLE","BAL","CBS"],[16,"LAC","MIA","FOX"],[16,"ARI","NO","FOX"],[16,"NE","NYJ","CBS"],
  [16,"TEN","LV","FOX"],[16,"SF","KC","CBS"],[16,"JAX","DAL","NBC"],[16,"NYG","DET","ESPN"],
  [16,"TB","ATL",null],[16,"CIN","IND",null],[16,"WAS","MIN",null],[16,"CAR","PIT",null],
  [17,"BAL","CIN","Prime"],[17,"NO","ATL","FOX"],[17,"SEA","CAR","FOX"],[17,"IND","CLE","FOX"],
  [17,"NYG","DAL","FOX"],[17,"BUF","MIA","CBS"],[17,"MIN","NYJ","CBS"],[17,"PIT","TEN","CBS"],
  [17,"LV","ARI","CBS"],[17,"DET","CHI","FOX"],[17,"PHI","SF","NBC"],[17,"HOU","GB","ESPN"],
  [17,"WAS","JAX",null],[17,"KC","LAC",null],[17,"DEN","NE",null],[17,"LAR","TB",null],
  [18,"SF","ARI",null],[18,"PIT","BAL",null],[18,"NYJ","BUF",null],[18,"ATL","CAR",null],
  [18,"CLE","CIN",null],[18,"LAC","DEN",null],[18,"DET","GB",null],[18,"TEN","HOU",null],
  [18,"JAX","IND",null],[18,"LV","KC",null],[18,"SEA","LAR",null],[18,"CHI","MIN",null],
  [18,"MIA","NE",null],[18,"TB","NO",null],[18,"PHI","NYG",null],[18,"DAL","WAS",null]
];
const BROADCASTS_BY_WEEK = {};
NETWORK_SCHEDULE_ROWS.forEach(([w, a, h, n]) => {
  if (!n) return;
  const wk = (BROADCASTS_BY_WEEK[w] = BROADCASTS_BY_WEEK[w] || {});
  wk[a] = n; wk[h] = n;
});

const ESPN_TO_SLEEPER = { WSH: "WAS", JAC: "JAX", LA: "LAR" };
const TV_SHORT = { "Prime Video": "Prime" };
// raw ESPN scoreboard events for a week, cached 6h — shared by loadKickoffs (per-team) and loadWeekGames (per-game)
async function fetchScoreboard(season, week, force) {
  const key = `wr_scoreboard_${season}_${week}`;
  const cached = store.get(key);
  if (!force && cached && Date.now() - cached.at < 6 * 3600e3) return cached.events;
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${season}&limit=100`);
  if (!r.ok) throw new Error(`scoreboard ${r.status}`);
  const j = await r.json();
  const events = j.events || [];
  store.set(key, { at: Date.now(), events });
  return events;
}
function parseGame(ev) {
  const c = ev.competitions?.[0]; if (!c) return null;
  const home = c.competitors.find(x => x.homeAway === "home"), away = c.competitors.find(x => x.homeAway === "away");
  if (!home || !away) return null;
  const at = new Date(c.date || ev.date);
  const ab = x => { const a = x.team.abbreviation; return ESPN_TO_SLEEPER[a] || a; };
  let tv = c.broadcasts?.[0]?.names?.join("/") || c.geoBroadcasts?.find(g => g.type?.shortName === "TV")?.media?.shortName || null;
  if (tv) Object.entries(TV_SHORT).forEach(([full, short]) => { tv = tv.replace(full, short); });
  const status = c.status || ev.status;
  const state = status?.type?.state || null; // 'pre' | 'in' | 'post'
  const halftime = status?.type?.name === "STATUS_HALFTIME";
  const period = status?.period || null, clock = status?.displayClock || null;
  const hs = home.score != null ? Number(home.score) : null, as = away.score != null ? Number(away.score) : null;
  return { id: ev.id, at, home: ab(home), away: ab(away), homeScore: hs, awayScore: as, tv, state, halftime, period, clock };
}
async function loadKickoffs(season, week, force) {
  const events = await fetchScoreboard(season, week, force);
  const map = {};
  events.forEach(ev => {
    const g = parseGame(ev); if (!g) return;
    map[g.home] = { at: g.at, opp: g.away, home: true, tv: g.tv, state: g.state, halftime: g.halftime, period: g.period, clock: g.clock, myScore: g.homeScore, oppScore: g.awayScore };
    map[g.away] = { at: g.at, opp: g.home, home: false, tv: g.tv, state: g.state, halftime: g.halftime, period: g.period, clock: g.clock, myScore: g.awayScore, oppScore: g.homeScore };
  });
  return map;
}
// full NFL slate for a week, one row per game — for the Games tab
async function loadWeekGames(season, week, force) {
  const events = await fetchScoreboard(season, week, force);
  return events.map(parseGame).filter(Boolean).sort((a, b) => a.at - b.at);
}
// game-state text for a Games-tab row (mirrors gameState() but works off a game row instead of a per-team kickoff map)
function gameRowState(g, now) {
  const dt = g.at.getTime() - now;
  if (dt > 0 && g.state !== "in" && g.state !== "post") return { phase: "pre", text: kickLabel(g.at) };
  if (g.state === "post" || (!g.state && -dt >= GAME_LEN_MS)) return { phase: "final", text: "FINAL" };
  return { phase: "live", text: liveText(g) };
}
// one NFL team's full-season schedule (opponent/bye + score + result), built from data already used elsewhere:
// loadSeasonSchedule() for the opponent-per-week map, loadWeekGames() (cached 6h) to backfill scores per week.
async function loadTeamSchedule(team, season, week) {
  const key = `wr_teamsched_${team}_${season}_${week}`;
  const cached = store.get(key);
  if (cached && Date.now() - cached.at < 6 * 3600e3) return cached.rows;
  const byWeek = await loadSeasonSchedule(season);
  const maxWeek = Math.max(...Object.keys(byWeek).map(Number));
  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);
  const gamesByWeek = await Promise.all(weeks.map(w => (byWeek[w][team] ? loadWeekGames(season, w).catch(() => []) : Promise.resolve(null))));
  const rows = weeks.map((w, i) => {
    const oppText = byWeek[w][team];
    if (!oppText) return { week: w, opp: null, bye: true };
    const home = oppText.startsWith("vs"), opp = oppText.replace(/^(vs|@) /, "");
    const g = gamesByWeek[i]?.find(x => x.home === team || x.away === team);
    const myScore = g ? (g.home === team ? g.homeScore : g.awayScore) : null;
    const oppScore = g ? (g.home === team ? g.awayScore : g.homeScore) : null;
    const result = myScore != null && oppScore != null ? (myScore > oppScore ? "W" : myScore < oppScore ? "L" : "T") : "";
    return { week: w, opp, home, myScore, oppScore, result };
  });
  store.set(key, { at: Date.now(), rows });
  return rows;
}
// full-season schedule (date + opponent only) for the look-ahead strip
async function loadSeasonSchedule(season) {
  const key = `wr_sched_${season}`;
  const cached = store.get(key);
  if (cached && Date.now() - cached.at < 24 * 3600e3) return cached.byWeek;
  const r = await fetch(`https://api.sleeper.app/schedule/nfl/regular/${season}`);
  if (!r.ok) throw new Error(`season schedule ${r.status}`);
  const rows = await r.json();
  const byWeek = {};
  rows.forEach(g => {
    byWeek[g.week] = byWeek[g.week] || {};
    byWeek[g.week][g.home] = `vs ${g.away}`;
    byWeek[g.week][g.away] = `@ ${g.home}`;
  });
  store.set(key, { at: Date.now(), byWeek });
  return byWeek;
}

// ---------- sleeper ----------
const SL = "https://api.sleeper.app/v1";
// League-scored projections for a week (opponent/date included) — shared by loadSleeper (current week) and
// loadWeekMatchup (any browsed week), since the same Sleeper endpoint answers both.
async function fetchProjections(season, week, scoring, need) {
  const key = scoring?.rec >= 1 ? "pts_ppr" : scoring?.rec >= 0.5 ? "pts_half_ppr" : "pts_std";
  const rows = await j(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF&order_by=${key}`);
  const proj = {};
  rows.forEach(r => {
    if (need && !need.has(r.player_id)) return;
    proj[r.player_id] = { pts: scoreStats(r.stats, scoring) ?? r.stats?.[key] ?? null, opp: r.opponent || null, date: r.date || null };
  });
  return proj;
}
// Score a projected stat line with the league's own scoring_settings (what Sleeper does for "league projections").
function scoreStats(stats, scoring) {
  if (!stats || !scoring) return null;
  let total = 0, hit = false;
  for (const [k, w] of Object.entries(scoring)) {
    if (!w) continue;
    let v = stats[k];
    if (v == null && k === "fgmiss") v = Object.keys(stats).filter(x => x.startsWith("fgmiss_")).reduce((a, x) => a + stats[x], 0) || null;
    if (v == null) continue;
    total += v * w; hit = true;
  }
  return hit ? Math.round(total * 100) / 100 : null;
}
async function j(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
// Live stat lines for the week (Sleeper's own scoring source). Indexed by player_id and by normalised name.
const normName = n => (n || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
async function loadStats(season, week) {
  const rows = await j(`https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF&order_by=pts_ppr`);
  const byId = {}, byName = {};
  rows.forEach(r => {
    byId[r.player_id] = r;
    const n = normName(`${r.player?.first_name || ""} ${r.player?.last_name || ""}`);
    if (n) (byName[n] = byName[n] || []).push(r);
  });
  return { byId, byName };
}
// find the stat row for a screenshot-derived Yahoo player
function statFor(stats, r) {
  if (!stats) return null;
  if (r.pos === "DEF") return stats.byId[r.team] || null;
  const c = stats.byName[normName(r.name)] || [];
  if (c.length === 1) return c[0];
  return c.find(x => (x.team || x.player?.team) === r.team) || c[0] || null;
}
// overlay live Yahoo points (Sleeper stats × Yahoo scoring) on rows whose game has started
function yahooLive(rows, stats, kick, now) {
  return rows.map(r => {
    const g = gameState(kick, r.team, now);
    if (!started(g)) return r;
    const st = statFor(stats, r);
    return { ...r, pts: st ? (scoreStats(st.stats, YAHOO_SCORING) ?? 0) : 0, live: true };
  });
}
async function loadPlayers(need) {
  const cached = store.get("wr_players");
  const fresh = cached && Date.now() - cached.at < 12 * 3600e3;
  if (fresh && [...need].every(id => cached.map[id])) return cached.map;
  const all = await j(`${SL}/players/nfl`);
  const map = { ...(cached?.map || {}) };
  need.forEach(id => {
    const p = all[id];
    map[id] = p ? { name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || id, pos: p.position, team: p.team, inj: p.injury_status || null }
              : { name: id, pos: "?", team: "?" };
  });
  store.set("wr_players", { at: Date.now(), map });
  return map;
}
// name -> [{id,name,team,pos}] index over ALL Sleeper players (not just this league's rostered set) — used to resolve a
// screenshot-derived Yahoo player (name/team only, no Sleeper id) to a real player_id. Separately cached (24h) from
// loadPlayers' rostered-only map above since it needs the full player dict rather than a filtered subset.
async function loadAllPlayersIndex() {
  const key = "wr_players_all";
  const cached = store.get(key);
  if (cached && Date.now() - cached.at < 24 * 3600e3) return cached.byName;
  const all = await j(`${SL}/players/nfl`);
  const byName = {};
  Object.entries(all).forEach(([id, p]) => {
    const name = p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim();
    const n = normName(name);
    if (!n) return;
    (byName[n] = byName[n] || []).push({ id, name, team: p.team, pos: p.position });
  });
  store.set(key, { at: Date.now(), byName });
  return byName;
}
function resolvePlayerId(byName, r) {
  const cands = byName[normName(r.name)] || [];
  if (cands.length <= 1) return cands[0]?.id || null;
  return (cands.find(c => c.team === r.team) || cands[0]).id;
}
// a player's weekly stat lines for the season so far, scored under both leagues' rules (reuses scoreStats() —
// same scoring engine that already powers yahooLive()). Cached per-player/season, filling in only missing weeks.
async function loadPlayerSeasonStats(playerId, season, throughWeek, sleeperScoring) {
  const key = `wr_pstats_${playerId}_${season}`;
  const cached = store.get(key) || { weeks: {} };
  const need = [];
  for (let w = 1; w < throughWeek; w++) if (!cached.weeks[w]) need.push(w);
  if (need.length) {
    const results = await Promise.allSettled(need.map(w => j(`https://api.sleeper.com/stats/nfl/player/${playerId}?season_type=regular&season=${season}&week=${w}`)));
    results.forEach((res, i) => { if (res.status === "fulfilled" && res.value?.stats) cached.weeks[need[i]] = res.value.stats; });
    store.set(key, cached);
  }
  const rows = [];
  for (let w = 1; w < throughWeek; w++) {
    const stats = cached.weeks[w]; if (!stats) continue;
    rows.push({ week: w, sleeperPts: scoreStats(stats, sleeperScoring), yahooPts: scoreStats(stats, YAHOO_SCORING), stats });
  }
  return rows;
}
async function loadSleeper(cfg) {
  const state = await j(`${SL}/state/nfl`);
  const week = state.display_week || state.week || 1, season = state.season;
  const lid = cfg.sleeperLeagueId.trim();
  const [league, rosters, users, matchups, transactions, trending] = await Promise.all([
    j(`${SL}/league/${lid}`), j(`${SL}/league/${lid}/rosters`), j(`${SL}/league/${lid}/users`),
    j(`${SL}/league/${lid}/matchups/${week}`),
    j(`${SL}/league/${lid}/transactions/${week}`).catch(() => []),
    j(`${SL}/players/nfl/trending/add?lookback_hours=48&limit=30`).catch(() => []),
  ]);
  let me = null;
  const uname = (cfg.sleeperUsername || "").trim().replace(/^@/, "");
  if (uname) { const u = await j(`${SL}/user/${uname}`).catch(() => null); if (u?.user_id) me = users.find(x => x.user_id === u.user_id) || null; }
  if (!me) { const want = (cfg.sleeperTeamName || "").toLowerCase(); me = users.find(u => (u.metadata?.team_name || "").toLowerCase() === want) || users.find(u => (u.display_name || "").toLowerCase() === want); }
  if (!me) throw new Error(`Couldn't find you by username "${uname || "—"}" or team name "${cfg.sleeperTeamName}".`);
  const myRoster = rosters.find(r => r.owner_id === me.user_id);
  const myMatch = matchups.find(m => m.roster_id === myRoster.roster_id) || null;
  const oppMatch = myMatch ? matchups.find(m => m.matchup_id === myMatch.matchup_id && m.roster_id !== myMatch.roster_id) : null;
  const oppRoster = oppMatch ? rosters.find(r => r.roster_id === oppMatch.roster_id) : null;
  const oppUser = oppRoster ? users.find(u => u.user_id === oppRoster.owner_id) : null;

  const need = new Set();
  rosters.forEach(r => (r.players || []).forEach(p => need.add(p)));
  trending.forEach(t => need.add(t.player_id));
  transactions.forEach(t => { Object.keys(t.adds || {}).forEach(p => need.add(p)); Object.keys(t.drops || {}).forEach(p => need.add(p)); });
  const players = await loadPlayers(need);

  let proj = {};
  try { proj = await fetchProjections(season, week, league.scoring_settings || {}, need); } catch { proj = {}; }

  const rostered = new Set(); rosters.forEach(r => (r.players || []).forEach(p => rostered.add(p)));
  const userBy = Object.fromEntries(rosters.map(r => [r.roster_id, users.find(u => u.user_id === r.owner_id)]));
  const standings = [...rosters].sort((a, b) => b.settings.wins - a.settings.wins || b.settings.fpts - a.settings.fpts).map(r => ({
    team: userBy[r.roster_id]?.metadata?.team_name || userBy[r.roster_id]?.display_name, mgr: userBy[r.roster_id]?.display_name,
    w: r.settings.wins, l: r.settings.losses, pf: r.settings.fpts + (r.settings.fpts_decimal || 0) / 100,
    mine: r.roster_id === myRoster.roster_id, rid: r.roster_id,
    faab: league.settings.waiver_budget ? league.settings.waiver_budget - (r.settings.waiver_budget_used || 0) : null,
  }));
  return { week, season, league, rosters, users, myRoster, myMatch, oppRoster, oppUser, oppMatch, transactions, trending, players, proj, rostered, standings, me, userBy };
}

// rows for a Sleeper roster
function slRows(d, roster, match) {
  const slots = d.league.roster_positions.filter(x => x !== "BN" && x !== "IR");
  const row = (id, slot) => {
    const p = d.players[id] || { name: id, pos: "?", team: "?" };
    const pr = d.proj[id] || {};
    return { id, slot, name: p.name, team: p.team || "FA", pos: p.pos, status: p.inj || "", proj: pr.pts ?? null, pts: match?.players_points?.[id] ?? null, bye: pr.opp === "BYE" };
  };
  const starters = (roster?.starters || []).map((id, i) => row(id, slots[i] || "?"));
  const ir = new Set(roster?.reserve || []);
  const bench = (roster?.players || []).filter(p => !(roster.starters || []).includes(p)).map(id => row(id, ir.has(id) ? "IR" : "BN"));
  return { starters, bench };
}

// ---------- history: my finished weeks, computed from Sleeper ----------
const ELIG = { QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"], FLEX: ["RB", "WR", "TE"], WRRB_FLEX: ["RB", "WR"], REC_FLEX: ["WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"] };
function optimalPoints(slots, pool) { // pool: [{pos, pts}]
  const strict = slots.filter(s => (ELIG[s] || []).length === 1), flex = slots.filter(s => (ELIG[s] || []).length > 1);
  const left = [...pool].sort((a, b) => b.pts - a.pts); let total = 0;
  const take = elig => { const i = left.findIndex(p => elig.includes(p.pos)); if (i >= 0) { total += left[i].pts; left.splice(i, 1); } };
  strict.forEach(s => take(ELIG[s])); flex.forEach(s => take(ELIG[s]));
  return total;
}
async function loadHistory(sl) {
  const lid = CONFIG.sleeperLeagueId, out = [];
  const slots = sl.league.roster_positions.filter(x => x !== "BN" && x !== "IR");
  for (let w = 1; w < sl.week; w++) {
    const ms = await j(`${SL}/league/${lid}/matchups/${w}`).catch(() => null); if (!ms) continue;
    const mine = ms.find(m => m.roster_id === sl.myRoster.roster_id); if (!mine) continue;
    const opp = ms.find(m => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id);
    const pool = Object.entries(mine.players_points || {}).map(([id, pts]) => ({ pos: sl.players[id]?.pos || "?", pts: pts || 0 }));
    const optimal = optimalPoints(slots, pool);
    out.push({ week: w, league: "Sleeper", me: +mine.points.toFixed(2), opp: opp ? +opp.points.toFixed(2) : null,
      result: opp ? (mine.points > opp.points ? "W" : mine.points < opp.points ? "L" : "T") : "", bench: `${(optimal - mine.points).toFixed(1)} left`, computed: true });
  }
  return out;
}

// full-season matchup schedule (opponent per week) for the "Week N" schedule menu
async function loadFullSchedule(sl) {
  const lid = CONFIG.sleeperLeagueId;
  const totalWeeks = sl.league.settings?.playoff_week_start ? sl.league.settings.playoff_week_start - 1 : 14;
  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  const results = await Promise.all(weeks.map(w => j(`${SL}/league/${lid}/matchups/${w}`).catch(() => null)));
  return weeks.map((w, i) => {
    const ms = results[i];
    const mine = ms?.find(m => m.roster_id === sl.myRoster.roster_id);
    if (!mine) return { week: w, oppName: null, myPts: null, oppPts: null };
    const opp = ms.find(m => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id);
    const oppUser = opp ? sl.userBy[opp.roster_id] : null;
    const played = w < sl.week;
    return {
      week: w,
      oppName: oppUser?.metadata?.team_name || oppUser?.display_name || "—",
      myPts: played ? +mine.points.toFixed(2) : (w === sl.week ? sl.myMatch?.points ?? null : null),
      oppPts: played ? (opp ? +opp.points.toFixed(2) : null) : (w === sl.week ? sl.oppMatch?.points ?? null : null),
    };
  });
}

// a single week's actual fantasy matchup (my + opponent rosters as they were started that week, with real points) —
// used by the Matchup/Team tabs' week arrows to browse weeks other than the live one. Sourced from the matchup
// object itself (its own starters/players/players_points), not the current roster, so it stays accurate for past
// weeks. For a week that hasn't happened yet, also pulls the same projections/injury status the live week uses
// (`upcoming`), so browsing ahead shows opponent/proj detail instead of a bare, all-zero roster.
async function loadWeekMatchup(sl, week) {
  const lid = CONFIG.sleeperLeagueId;
  const upcoming = week > sl.week;
  const [matchups, proj] = await Promise.all([
    j(`${SL}/league/${lid}/matchups/${week}`),
    upcoming ? fetchProjections(sl.season, week, sl.league.scoring_settings || {}).catch(() => ({})) : Promise.resolve({}),
  ]);
  const mine = matchups.find(m => m.roster_id === sl.myRoster.roster_id) || null;
  const opp = mine ? matchups.find(m => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id) : null;
  const oppRoster = opp ? sl.rosters.find(r => r.roster_id === opp.roster_id) : null;
  const oppUser = oppRoster ? sl.userBy[oppRoster.roster_id] : null;
  const need = new Set([...(mine?.players || []), ...(opp?.players || [])].filter(id => !sl.players[id]));
  const fetched = need.size ? await loadPlayers(need) : {};
  const players = { ...sl.players, ...fetched };
  const slots = sl.league.roster_positions.filter(x => x !== "BN" && x !== "IR");
  const rowsFor = match => {
    if (!match) return { starters: [], bench: [] };
    const row = (id, slot) => {
      const p = players[id] || { name: id, pos: "?", team: "?" };
      const pr = proj[id] || {};
      return { id, slot, name: p.name, team: p.team || "FA", pos: p.pos, status: upcoming ? (p.inj || "") : "", proj: pr.pts ?? null, pts: match.players_points?.[id] ?? null, bye: pr.opp === "BYE" };
    };
    const starters = (match.starters || []).map((id, i) => row(id, slots[i] || "?"));
    const bench = (match.players || []).filter(id => !(match.starters || []).includes(id)).map(id => row(id, "BN"));
    return { starters, bench };
  };
  return {
    week, upcoming, myPts: mine?.points ?? null, oppPts: opp?.points ?? null,
    oppName: oppUser?.metadata?.team_name || oppUser?.display_name || "—",
    oppRec: oppRoster ? `${oppRoster.settings.wins}-${oppRoster.settings.losses}` : "",
    my: rowsFor(mine), opp: rowsFor(opp),
  };
}

// ---------- live matchup timeline ----------
// human-readable labels for the stat keys that actually appear in YAHOO_SCORING / typical Sleeper scoring
const STAT_LABEL = {
  pass_yd: "passing yards", pass_td: "passing TD", pass_int: "interception thrown", pass_2pt: "passing 2pt",
  rush_yd: "rushing yards", rush_td: "rushing TD", rush_2pt: "rushing 2pt",
  rec: "reception", rec_yd: "receiving yards", rec_td: "receiving TD", rec_2pt: "receiving 2pt",
  fum_lost: "fumble lost", fum_rec_td: "fumble return TD", fum_rec: "fumble recovery",
  fgm_0_19: "field goal", fgm_20_29: "field goal", fgm_30_39: "field goal", fgm_40_49: "field goal (40+)", fgm_50p: "field goal (50+)", xpm: "extra point",
  sack: "sack", int: "interception", def_td: "defensive TD", safe: "safety",
  blk_kick: "blocked kick", def_st_td: "special teams TD", st_td: "special teams TD", def_2pt: "defensive 2pt",
};
function weightFor(key, scoring) { return scoring?.[key] || 0; }
// compare two weekly stat snapshots (Sleeper's loadStats().byId shape) for a set of players, emit one raw delta
// per stat key that increased since the last poll. Deltas are unscored — scored per-league at render time, since
// the same underlying Sleeper stat feed is shared by both leagues (same pattern as yahooLive()).
function diffStatSnapshots(prevById, nextById, playerIds, now) {
  const out = [];
  playerIds.forEach(id => {
    const prev = prevById?.[id]?.stats || {}, next = nextById?.[id]?.stats;
    if (!next) return;
    Object.entries(next).forEach(([k, v]) => {
      const before = prev[k] || 0;
      if (typeof v !== "number" || v <= before) return;
      out.push({ at: now, playerId: id, statKey: k, delta: v - before });
    });
  });
  return out;
}

// ---------- UI atoms ----------
function Btn({ children, onClick, tone = INK, disabled, ghost, small, ariaLabel }) {
  return <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} style={{ fontFamily: cond, fontWeight: 600, fontSize: small ? 14 : 16, padding: small ? "6px 12px" : "10px 16px", borderRadius: 6, border: `1.5px solid ${tone}`, background: ghost ? "transparent" : tone, color: ghost ? tone : "#fff", opacity: disabled ? 0.45 : 1, cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>{children}</button>;
}
const Card = ({ children, style }) => <div style={{ background: PAPER, borderRadius: 10, padding: 14, ...style }}>{children}</div>;
const Empty = ({ children }) => <div style={{ color: MUTE, fontSize: 15, lineHeight: 1.45 }}>{children}</div>;
const H = ({ tone, children, style }) => <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 18, color: tone, lineHeight: 1.1, ...style }}>{children}</div>;
// expand/collapse container — top-level sections render as their own Card with a clickable header; `nested` renders
// a lighter row (divider instead of a card) for sub-sections living inside another Collapsible (e.g. per-position
// groups inside the Analysis section)
function Collapsible({ tone, title, defaultOpen = false, nested, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const header = (
    <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
      {nested ? <span style={{ fontFamily: cond, fontWeight: 700, fontSize: 14, color: tone }}>{title}</span> : <H tone={tone}>{title}</H>}
      <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {badge}
        <span style={{ fontSize: 15, color: MUTE, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
      </span>
    </button>
  );
  if (nested) {
    return (
      <div style={{ borderTop: `1px solid ${HAIRLINE}`, padding: "10px 0" }}>
        {header}
        {open && <div style={{ marginTop: 8 }}>{children}</div>}
      </div>
    );
  }
  return (
    <Card style={{ marginBottom: 10 }}>
      {header}
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </Card>
  );
}
function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return <Btn ghost small tone={MUTE} onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch {} }}>{ok ? <Check size={14} /> : <Copy size={14} />}{ok ? "Copied" : "Copy"}</Btn>;
}
function Status({ s }) {
  if (!s) return null;
  const short = /^questionable/i.test(s) ? "Q" : /^doubtful/i.test(s) ? "D" : /^out/i.test(s) ? "O" : s;
  const bad = /^(O|IR|OUT|SUSP|PUP)/i.test(short);
  return <span style={{ fontFamily: cond, fontWeight: 700, fontSize: 12, color: bad ? "#fff" : OX, background: bad ? OX : "#F7E3E6", padding: "1px 4px", borderRadius: 3, marginLeft: 4, verticalAlign: "middle" }}>{short}</span>;
}
function Chip({ children, tone = MUTE, bg = CHIP_BG, style }) {
  return <span style={{ fontFamily: cond, fontWeight: 700, fontSize: 11, color: tone, background: bg, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", ...style }}>{children}</span>;
}
function Kick({ g, showTv }) { // kickoff / lock state text
  if (!g?.text) return null;
  const c = g.phase === "soon" ? AMBER : g.phase === "live" ? WIN : g.phase === "final" ? MUTE : MUTE;
  return (
    <span>
      <span style={{ color: c, fontWeight: g.phase === "soon" || g.phase === "live" ? 700 : 400 }}>{g.text}</span>
      {showTv && g.tv && g.phase !== "final" && <span style={{ color: MUTE, fontWeight: 400 }}> · {g.tv}</span>}
    </span>
  );
}

// ---------- screens ----------
// small clickable team abbreviation — opens that team's full-season schedule (see TeamScheduleModal)
function TeamAbbrev({ team, onClick, style }) {
  if (!team || !onClick) return <span style={style}>{team}</span>;
  return (
    <span onClick={e => { e.stopPropagation(); onClick(team); }}
      style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2, ...style }}>{team}</span>
  );
}
function PlayerCell({ r, g, align = "left", full, onClick, onTeamClick }) {
  if (!r) return <div style={{ color: MUTE }}>—</div>;
  const done = g?.phase === "final";
  const oppText = r.bye ? "BYE" : g?.opp ? `${g.home ? "vs" : "@"} ${g.opp}` : "";
  return (
    <div onClick={onClick} style={{ textAlign: align, minWidth: 0, opacity: done ? 0.55 : 1, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontFamily: cond, fontWeight: 600, fontSize: full ? 15 : 14, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {full ? r.name : r.status && r.pos !== "DEF" ? r.name.split(/\s+/).slice(1).join(" ") : shortName(r.name, r.pos)}<Status s={r.status} />
        {r.pos !== "DEF" && <span style={{ color: MUTE, fontWeight: 500, fontSize: full ? 14 : 13 }}> · <TeamAbbrev team={r.team} onClick={onTeamClick} /></span>}
      </div>
      <div style={{ fontSize: 12, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {oppText}{g?.text ? <> · <Kick g={g} showTv={full} /></> : ""}
      </div>
    </div>
  );
}
const Num = ({ v, strong }) => <div style={{ fontFamily: cond, fontWeight: strong ? 700 : 500, fontSize: strong ? 15 : 13, color: strong ? TEXT : MUTE, textAlign: "center", minWidth: 32 }}>{fmt(v)}</div>;

const WeekLink = ({ week, onClick }) => week == null ? null : (
  <button onClick={onClick} style={{ fontFamily: cond, fontWeight: 700, fontSize: 13, color: MUTE, background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>Week {week} <Chip>Current</Chip> <span style={{ fontSize: 15 }}>›</span></button>
);

// ‹ Week N › header shared by Games/Matchup/Team — tapping the week number opens WeekPicker; arrows step by one
function WeekNav({ week, min = 1, max = 18, onChange, onOpenPicker }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <button onClick={() => onChange(Math.max(min, week - 1))} disabled={week <= min} aria-label="Previous week" style={{ background: "none", border: "none", fontSize: 22, color: week <= min ? MUTE : TEXT, cursor: week <= min ? "default" : "pointer", padding: "0 8px" }}>‹</button>
      <button onClick={onOpenPicker} aria-haspopup="dialog" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><H tone={INK}>Week {week}</H></button>
      <button onClick={() => onChange(Math.min(max, week + 1))} disabled={week >= max} aria-label="Next week" style={{ background: "none", border: "none", fontSize: 22, color: week >= max ? MUTE : TEXT, cursor: week >= max ? "default" : "pointer", padding: "0 8px" }}>›</button>
    </div>
  );
}

function Matchup({ tone, meName, meRec, oppName, oppRec, mine, theirs, myPts, oppPts, myProj, oppProj, sub, kick, now, action, final, nav, week, onWeekClick, onPlayerClick, onTeamClick }) {
  const rows = Math.max(mine.length, theirs.length);
  const live = !final && (myPts || 0) + (oppPts || 0) > 0 && [...mine, ...theirs].some(r => started(gameState(kick, r.team, now)));
  const phaseLabel = final ? ((myPts != null || oppPts != null) ? "final" : "upcoming") : (live ? "live" : "proj");
  return (
    <Card>
      {nav && <WeekNav {...nav} />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div><H tone={tone}>{meName}</H><div style={{ fontSize: 12, color: MUTE }}>{meRec}</div></div>
        <div style={{ fontFamily: cond, fontWeight: 600, fontSize: 12, color: MUTE }}>vs</div>
        <div style={{ textAlign: "right" }}><H tone={TEXT}>{oppName || "—"}</H><div style={{ fontSize: 12, color: MUTE }}>{oppRec}</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "baseline", marginBottom: 2 }}>
        <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 40, lineHeight: 1, color: live && myPts > oppPts ? WIN : TEXT }}>{fmt(myPts)}</div>
        <div style={{ fontSize: 12, color: MUTE }}>{phaseLabel}</div>
        <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 40, lineHeight: 1, textAlign: "right", color: live && oppPts > myPts ? WIN : TEXT }}>{fmt(oppPts)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", fontSize: 13, color: MUTE, marginBottom: 10 }}>
        <div>proj {fmt(myProj)}</div><div>{sub}</div><div style={{ textAlign: "right" }}>proj {fmt(oppProj)}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6 }}>
        <div style={{ fontFamily: cond, fontWeight: 700, fontSize: 13, color: MUTE }}>Starters</div>
        {!nav && <WeekLink week={week} onClick={onWeekClick} />}
      </div>
      <div style={{ borderTop: `1px solid ${LINE}` }}>
        {Array.from({ length: rows }).map((_, i) => {
          const a = mine[i], b = theirs[i];
          const ga = a && gameState(kick, a.team, now), gb = b && gameState(kick, b.team, now);
          const showA = final || started(ga), showB = final || started(gb);
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 36px 38px 36px 1fr", gap: 4, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
              <PlayerCell r={a} g={ga} onClick={a && onPlayerClick && (() => onPlayerClick(a))} onTeamClick={onTeamClick} />
              <Num v={showA ? (a?.pts ?? a?.proj) : a?.proj} strong={showA && a?.pts != null} />
              <Chip style={{ textAlign: "center", padding: "3px 0", fontSize: 10 }}>{a?.slot || b?.slot}</Chip>
              <Num v={showB ? (b?.pts ?? b?.proj) : b?.proj} strong={showB && b?.pts != null} />
              <PlayerCell r={b} g={gb} align="right" onClick={b && onPlayerClick && (() => onPlayerClick(b))} onTeamClick={onTeamClick} />
            </div>
          );
        })}
      </div>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </Card>
  );
}

function Team({ tone, name, meta, starters, bench, kick, now, contingency, ahead, week, action, final, nav, onWeekClick, onPlayerClick, onTeamClick }) {
  const Row = ({ r }) => {
    const g = gameState(kick, r.team, now), c = contingency?.[r.name.toLowerCase()];
    const shown = final ? r.pts : (started(g) ? r.pts : null);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 40px 40px", gap: 6, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
        <Chip style={{ textAlign: "center", padding: "3px 0", background: r.slot === "BN" || r.slot === "IR" ? "transparent" : CHIP_BG }}>{r.slot}</Chip>
        <div style={{ minWidth: 0 }}>
          <PlayerCell r={r} g={g} full onClick={onPlayerClick && (() => onPlayerClick(r))} onTeamClick={onTeamClick} />
          {c && <div style={{ marginTop: 3 }}><Chip tone="#7A5A00" bg="#FFF6D6">if out → {c}</Chip></div>}
        </div>
        <Num v={r.proj} /><Num v={shown} strong={final ? r.pts != null : started(g)} />
      </div>
    );
  };
  const weeks = final ? [] : [1, 2, 3].map(i => week + i).filter(w => ahead?.[w]);
  return (
    <Card>
      {nav && <WeekNav {...nav} />}
      <H tone={tone}>{name}</H>
      <div style={{ fontSize: 12, color: MUTE, marginBottom: 8 }}>{meta}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontFamily: cond, fontWeight: 700, fontSize: 13, color: MUTE }}>Starters</div>
        {!nav && <WeekLink week={week} onClick={onWeekClick} />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 40px 40px", gap: 6, fontSize: 11, color: MUTE, fontFamily: cond, fontWeight: 600, borderBottom: `1px solid ${LINE}`, paddingBottom: 4 }}>
        <div /><div /><div style={{ textAlign: "center" }}>proj</div><div style={{ textAlign: "center" }}>pts</div>
      </div>
      {starters.map((r, i) => <Row key={"s" + i} r={r} />)}
      <div style={{ fontSize: 12, color: MUTE, padding: "8px 0 2px", fontFamily: cond, fontWeight: 600 }}>Bench</div>
      {bench.map((r, i) => <Row key={"b" + i} r={r} />)}
      {starters.length + bench.length === 0 && <Empty>No roster yet.</Empty>}
      {weeks.length > 0 && starters.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: cond, fontWeight: 700, fontSize: 13, color: MUTE, marginBottom: 4 }}>Next {weeks.length} weeks — starters</div>
          <div style={{ display: "grid", gridTemplateColumns: `1fr repeat(${weeks.length}, 62px)`, gap: 4, fontSize: 12 }}>
            <div /> {weeks.map(w => <div key={w} style={{ textAlign: "center", fontFamily: cond, fontWeight: 700, color: MUTE }}>Wk {w}</div>)}
            {starters.map((r, i) => (
              <React.Fragment key={i}>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: cond, fontWeight: 600 }}>{shortName(r.name, r.pos)} <span style={{ color: MUTE, fontWeight: 400 }}>{r.team}</span></div>
                {weeks.map(w => { const o = ahead[w]?.[r.team]; const bye = !o; return <div key={w} style={{ textAlign: "center", borderRadius: 4, padding: "2px 0", background: bye ? OX : "transparent", color: bye ? "#fff" : TEXT, fontFamily: cond, fontWeight: bye ? 700 : 500 }}>{bye ? "BYE" : o}</div>; })}
              </React.Fragment>
            ))}
          </div>
          {(() => { const byeWeeks = weeks.map(w => [w, starters.filter(r => !ahead[w]?.[r.team]).length]).filter(([, n]) => n >= 3); return byeWeeks.length ? <div style={{ marginTop: 6, fontSize: 12, color: OX, fontWeight: 600 }}>{byeWeeks.map(([w, n]) => `Week ${w}: ${n} starters on bye`).join(" · ")}</div> : null; })()}
        </div>
      )}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </Card>
  );
}

// shared bottom-sheet chrome (overlay + slide-up card + close button) reused by every modal below
function BottomSheet({ tone, title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 30, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: PAPER, borderRadius: "14px 14px 0 0", maxHeight: "80vh", overflowY: "auto", width: "100%", maxWidth: 640, padding: "16px 16px calc(16px + env(safe-area-inset-bottom))" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <H tone={tone}>{title}</H>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, color: MUTE, cursor: "pointer", padding: 4 }}>&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ScheduleModal({ tone, title, myName, rows, currentWeek, empty, onClose }) {
  return (
    <BottomSheet tone={tone} title={title} onClose={onClose}>
      {!rows?.length ? <Empty>{empty}</Empty> : rows.map(r => (
        <div key={r.week} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto 1fr", gap: 8, alignItems: "center", padding: "10px 6px", borderRadius: 8, background: r.week === currentWeek ? HILITE : "transparent", borderBottom: `1px solid ${HAIRLINE}` }}>
          <Chip style={{ textAlign: "center", padding: "4px 0" }}>Wk {r.week}</Chip>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: cond, fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{myName}</div>
            <div style={{ fontSize: 13, color: MUTE }}>{fmt(r.myPts)}</div>
          </div>
          <div style={{ fontSize: 11, color: MUTE }}>vs</div>
          <div style={{ minWidth: 0, textAlign: "right" }}>
            <div style={{ fontFamily: cond, fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.oppName ?? "—"}</div>
            <div style={{ fontSize: 13, color: MUTE }}>{fmt(r.oppPts)}</div>
          </div>
        </div>
      ))}
    </BottomSheet>
  );
}
// a real NFL team's full-season schedule (opponent/bye, score, W-L) — opened by clicking any TeamAbbrev
function TeamScheduleModal({ team, rows, busy, err, currentWeek, onClose }) {
  return (
    <BottomSheet tone={INK} title={`${team} — Schedule`} onClose={onClose}>
      {err ? <Empty>{err}</Empty> : !rows?.length ? <Empty>{busy ? "Loading schedule…" : "No schedule yet."}</Empty> : rows.map(r => (
        <div key={r.week} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 8, alignItems: "center", padding: "9px 6px", borderRadius: 8, background: r.week === currentWeek ? HILITE : "transparent", borderBottom: `1px solid ${HAIRLINE}` }}>
          <Chip style={{ textAlign: "center", padding: "4px 0" }}>Wk {r.week}</Chip>
          {r.bye ? <div style={{ color: MUTE, fontFamily: cond, fontWeight: 600 }}>BYE</div> : <>
            <div style={{ fontFamily: cond, fontWeight: 600, fontSize: 14 }}>{r.home ? "vs" : "@"} {r.opp}</div>
            <div style={{ fontFamily: cond, fontWeight: 700, fontSize: 14, textAlign: "right" }}>
              {r.myScore != null ? <span style={{ color: r.result === "W" ? WIN : r.result === "L" ? OX : TEXT }}>{r.result} {r.myScore}-{r.oppScore}</span> : <span style={{ color: MUTE, fontWeight: 500 }}>{kickLabel(r.at)}</span>}
            </div>
          </>}
        </div>
      ))}
    </BottomSheet>
  );
}
// a player's week-by-week stats & fantasy points this season, scored under both leagues' rules, plus any recent
// news the scheduled task logged for them (see cowork-task-prompt.md's `news` block)
function PlayerStatsModal({ player, rows, busy, err, news, newsAvailable, onClose }) {
  const sTot = rows?.reduce((a, r) => a + (r.sleeperPts || 0), 0), yTot = rows?.reduce((a, r) => a + (r.yahooPts || 0), 0);
  return (
    <BottomSheet tone={INK} title={`${player?.name || ""}${player?.team ? ` · ${player.team}` : ""}${player?.pos ? ` · ${player.pos}` : ""}`} onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: cond, fontWeight: 700, fontSize: 13, color: MUTE, marginBottom: 6 }}>Recent news</div>
        {news.length > 0 ? news.map((n, i) => (
          <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
            {n.headline && <div style={{ fontFamily: cond, fontWeight: 600, fontSize: 14, lineHeight: 1.35 }}>{n.headline}</div>}
            {n.summary && <div style={{ fontSize: 13, color: n.headline ? MUTE : TEXT, marginTop: n.headline ? 2 : 0, lineHeight: 1.4 }}>{n.summary}</div>}
            <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>
              {n.source || "Source"}{n.at ? ` · ${stamp(n.at)}` : ""}
              {n.url && <> · <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ color: INK }}>Read more</a></>}
            </div>
          </div>
        )) : <Empty>{newsAvailable ? "No recent news for this player." : `No player news yet — the scheduled task needs updating to log a "news" entry per player (see cowork-task-prompt.md).`}</Empty>}
      </div>
      {err ? <Empty>{err}</Empty> : !rows?.length ? <Empty>{busy ? "Loading stats…" : "No stats yet this season."}</Empty> : <>
        <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 70px 70px", gap: 8, fontSize: 11, color: MUTE, fontFamily: cond, fontWeight: 700, borderBottom: `1px solid ${LINE}`, paddingBottom: 4, marginBottom: 2 }}>
          <div>Wk</div><div /><div style={{ textAlign: "right" }}>Sleeper</div><div style={{ textAlign: "right" }}>Yahoo</div>
        </div>
        {rows.map(r => (
          <div key={r.week} style={{ display: "grid", gridTemplateColumns: "44px 1fr 70px 70px", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${HAIRLINE}`, fontSize: 14 }}>
            <div style={{ fontFamily: cond, fontWeight: 600 }}>{r.week}</div><div />
            <div style={{ textAlign: "right", fontFamily: cond, fontWeight: 600 }}>{fmt(r.sleeperPts)}</div>
            <div style={{ textAlign: "right", fontFamily: cond, fontWeight: 600 }}>{fmt(r.yahooPts)}</div>
          </div>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 70px 70px", gap: 8, padding: "8px 0 2px", fontSize: 14, fontWeight: 700 }}>
          <div style={{ gridColumn: "1 / 3", fontFamily: cond }}>Season total</div>
          <div style={{ textAlign: "right", fontFamily: cond }}>{fmt(sTot)}</div>
          <div style={{ textAlign: "right", fontFamily: cond }}>{fmt(yTot)}</div>
        </div>
      </>}
    </BottomSheet>
  );
}

function Rules({ tone, rows, style }) {
  return (
    <Card style={style}>
      <H tone={tone} style={{ marginBottom: 6 }}>League rules</H>
      {rows.map(([k, v], i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "104px 1fr", gap: 8, fontSize: 14, padding: "4px 0", borderBottom: i < rows.length - 1 ? `1px solid ${HAIRLINE}` : "none" }}><span style={{ color: MUTE, fontFamily: cond, fontWeight: 600 }}>{k}</span><span>{v}</span></div>)}
    </Card>
  );
}
function Standings({ tone, rows, faab }) {
  return (
    <Card>
      <H tone={tone} style={{ marginBottom: 6 }}>Standings</H>
      {rows.length === 0 ? <Empty>No standings yet.</Empty> : rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto auto", gap: 8, alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${HAIRLINE}`, background: r.mine ? HILITE : "transparent", fontWeight: r.mine ? 700 : 400 }}>
          <div style={{ fontFamily: cond, color: MUTE }}>{i + 1}</div>
          <div style={{ fontFamily: cond, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.team}</div>
          <div style={{ fontFamily: cond, fontSize: 14 }}>{r.record ?? `${r.w}-${r.l}`}</div>
          <div style={{ fontSize: 13, color: MUTE, minWidth: 64, textAlign: "right" }}>{typeof r.pf === "number" ? r.pf.toFixed(1) : r.pf}{faab && r.faab != null ? ` · $${r.faab}` : ""}</div>
        </div>
      ))}
    </Card>
  );
}

// structured lineup call (data.lineup.<league>) rendered as a kickoff-ordered checklist
function LineupCard({ rows, kick, now }) {
  if (!rows?.length) return <Empty>No lineup call yet.</Empty>;
  const sorted = [...rows].map(r => ({ ...r, g: gameState(kick, r.team, now) })).sort((a, b) => (a.g.at?.getTime() || 9e15) - (b.g.at?.getTime() || 9e15));
  const callTone = c => /^sit|^bench|^out/i.test(c) ? OX : /^watch|^check|^if/i.test(c) ? AMBER : WIN;
  return sorted.map((r, i) => (
    <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 8, alignItems: "start", padding: "7px 0", borderBottom: `1px solid ${HAIRLINE}`, opacity: r.g.phase === "final" ? 0.55 : 1 }}>
      <Chip style={{ textAlign: "center", padding: "3px 0", fontSize: 10, marginTop: 2 }}>{r.slot}</Chip>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: cond, fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>{r.name}<Status s={r.status} /></div>
        <div style={{ fontSize: 13, lineHeight: 1.35, marginTop: 2 }}>
          <span style={{ color: callTone(r.call || ""), fontWeight: 700, fontFamily: cond }}>{r.call || "start"}</span>
          {r.note ? <span style={{ color: TEXT }}> — {r.note}</span> : null}
        </div>
        {r.ifOut && <div style={{ marginTop: 3 }}><Chip tone="#7A5A00" bg="#FFF6D6">if out → {r.ifOut}</Chip></div>}
      </div>
      <div style={{ fontSize: 12, textAlign: "right", whiteSpace: "nowrap", color: MUTE }}>
        <div>{r.team}</div>
        <Kick g={r.g} />
      </div>
    </div>
  ));
}

// matchup context (data.analysis.<league>) rendered as an in-depth per-position breakdown of the current lineup
const DEF_RANK_TONE = r => r == null ? MUTE : r <= 10 ? OX : r >= 23 ? WIN : AMBER; // low rank = stingy D = tough matchup = red; high rank = plus matchup = green
const POS_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];
function MatchupRow({ r }) {
  const weatherShown = r.weather?.impact && r.weather.impact !== "none";
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontFamily: cond, fontWeight: 700, fontSize: 15 }}>{r.name}</span>
          <span style={{ fontSize: 12, color: MUTE }}> {r.team}{r.opp ? ` vs ${r.opp}` : ""}</span>
        </div>
        {r.defRank != null && <Chip tone={DEF_RANK_TONE(r.defRank)} bg={CHIP_BG} style={{ flexShrink: 0 }}>#{r.defRank} vs {r.pos}</Chip>}
      </div>
      {r.defRankNote && <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{r.defRankNote}</div>}
      {(r.vegas?.total != null || r.vegas?.spread != null || r.vegas?.impliedTeam != null || weatherShown) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 12, color: MUTE }}>
          {r.vegas?.total != null && <span>O/U {r.vegas.total}</span>}
          {r.vegas?.spread != null && <span>Spread {r.vegas.spread > 0 ? "+" : ""}{r.vegas.spread}</span>}
          {r.vegas?.impliedTeam != null && <span>Implied {r.vegas.impliedTeam}</span>}
          {weatherShown && <span style={{ color: r.weather.impact === "major" ? OX : AMBER, fontWeight: 600 }}>{r.weather.note}</span>}
        </div>
      )}
      {r.takeaway && <div style={{ fontSize: 14, marginTop: 5, lineHeight: 1.35 }}>{r.takeaway}</div>}
    </div>
  );
}
function Analysis({ tone, rows }) {
  if (!rows?.length) return <Empty>No matchup analysis yet. The scheduled task writes this each run.</Empty>;
  const starters = rows.filter(r => r.slot !== "BN" && r.slot !== "IR");
  const groups = POS_ORDER.map(p => [p, starters.filter(r => r.pos === p)]).filter(([, g]) => g.length);
  const extra = starters.filter(r => !POS_ORDER.includes(r.pos));
  if (extra.length) groups.push(["FLEX", extra]);
  return (
    <div>
      {groups.map(([pos, g]) => (
        <Collapsible key={pos} nested tone={tone} title={pos} defaultOpen={false}>
          {g.map((r, i) => <MatchupRow key={i} r={r} />)}
        </Collapsible>
      ))}
    </div>
  );
}

function Report({ text }) {
  if (!text) return null;
  const label = l => l.match(/^([A-Za-z0-9 /–-]{2,24}):\s*(.*)$/);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {text.split(/\n\s*\n/).map((b, i) => {
        const lines = b.split("\n"), head = lines[0];
        const isA = /GANGSTAS|Sleeper/i.test(head), isB = /GAME OF THROWS|Yahoo/i.test(head);
        const tone = isA ? INK : isB ? OX : MUTE;
        const headIsLabel = /^(FYI|Data|Note|Recap|Waivers|Trades)\b/i.test(head) && label(head);
        const urgent = i === 0 && head === head.toUpperCase() && !isA && !isB && /[A-Z]{4,}/.test(head);
        const body = headIsLabel ? lines : lines.slice(1);
        return (
          <div key={i} style={{ borderLeft: `4px solid ${urgent ? FLAG : tone}`, paddingLeft: 12 }}>
            {!headIsLabel && <div style={{ fontFamily: cond, fontWeight: 700, fontSize: 17, color: urgent ? AMBER : tone, marginBottom: 4, lineHeight: 1.25 }}>{head}</div>}
            {body.map((l, k) => {
              const m = label(l);
              const hot = /^(Do now|Locks)/i.test(l) && !/nothing|none/i.test(l);
              return m
                ? <div key={k} style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 8, fontSize: 15, lineHeight: 1.4, padding: "3px 0", background: hot ? "#FFF6D6" : "transparent", borderRadius: 4, color: hot ? FLAG_TEXT : undefined }}><span style={{ color: hot ? "#7A5A00" : MUTE, fontFamily: cond, fontWeight: 600 }}>{m[1]}</span><span>{m[2]}</span></div>
                : <div key={k} style={{ fontSize: 15, lineHeight: 1.4, padding: "2px 0" }}>{l}</div>;
            })}
          </div>
        );
      })}
    </div>
  );
}
function Section({ item, empty }) {
  return (
    <Card>
      {item ? <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
          <div style={{ fontSize: 12, color: MUTE }}>{stamp(item.at)}</div><CopyBtn text={item.text} />
        </div>
        <Report text={item.text} />
      </> : <Empty>{empty}</Empty>}
    </Card>
  );
}

// full NFL slate for one week, paged, with clickable team abbreviations
function GamesView({ week, games, busy, err, onWeekChange, onOpenPicker, onTeamClick, now }) {
  return (
    <Card>
      <WeekNav week={week} onChange={onWeekChange} onOpenPicker={onOpenPicker} />
      {err ? <Empty>{err}</Empty> : !games?.length ? <Empty>{busy ? "Loading games…" : "No games this week."}</Empty> : games.map(g => {
        const gs = gameRowState(g, now);
        return (
          <div key={g.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
            <div style={{ fontFamily: cond, fontWeight: 600, fontSize: 15 }}>
              <TeamAbbrev team={g.away} onClick={onTeamClick} /> @ <TeamAbbrev team={g.home} onClick={onTeamClick} />
              {g.tv && gs.phase !== "final" && <span style={{ color: MUTE, fontWeight: 400, fontSize: 12 }}> · {g.tv}</span>}
            </div>
            <div style={{ textAlign: "right" }}>
              {g.awayScore != null && g.homeScore != null && <div style={{ fontFamily: cond, fontWeight: 700, fontSize: 15 }}>{g.awayScore}-{g.homeScore}</div>}
              <div style={{ fontSize: 12, color: gs.phase === "live" ? WIN : MUTE, fontWeight: gs.phase === "live" ? 700 : 400 }}>{gs.text}</div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
// list of every week (1-18), opened by tapping a WeekNav header — the live/current week is tagged Current.
// Shared by Games (NFL slate), Matchup and Team (fantasy roster for that week).
function WeekPicker({ week, currentWeek, onSelect, onClose }) {
  return (
    <BottomSheet tone={INK} title="Jump to a week" onClose={onClose}>
      {Array.from({ length: 18 }, (_, i) => i + 1).map(w => (
        <button key={w} onClick={() => onSelect(w)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: w === week ? HILITE : "transparent", border: "none", borderRadius: 8, padding: "10px 10px", cursor: "pointer", textAlign: "left" }}>
          <span style={{ fontFamily: cond, fontWeight: 700, fontSize: 15, color: TEXT }}>Week {w}</span>
          {w === currentWeek && <Chip>Current</Chip>}
        </button>
      ))}
    </BottomSheet>
  );
}
// reverse-chronological feed of fantasy-point-scoring stat changes for the active matchup, built by diffing
// successive Sleeper live-stat snapshots (diffStatSnapshots) — see the timeline effect in App() for how entries accumulate
function MatchupTimeline({ tone, entries, players, scoring, myIds, now, live }) {
  const scored = (entries || []).map(e => ({ ...e, ptsDelta: Math.round(e.delta * weightFor(e.statKey, scoring) * 100) / 100 })).filter(e => e.ptsDelta);
  const sorted = [...scored].sort((a, b) => b.at - a.at);
  return (
    <Card>
      <H tone={tone} style={{ marginBottom: 8 }}>Scoring feed</H>
      {!live && <Empty>No live games right now — check back during kickoff.</Empty>}
      {live && sorted.length === 0 && <Empty>No scoring plays yet — entries appear here as stats come in.</Empty>}
      {live && sorted.map((e, i) => {
        const p = players[e.playerId] || {};
        const mine = myIds.has(e.playerId);
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "4px 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
            <div style={{ alignSelf: "stretch", background: mine ? tone : MUTE, borderRadius: 3 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: cond, fontWeight: 600, fontSize: 14 }}>{p.name || e.playerId} <span style={{ color: MUTE, fontWeight: 500 }}>· {p.team || ""}</span></div>
              <div style={{ fontSize: 12, color: MUTE }}>{STAT_LABEL[e.statKey] || e.statKey} · {rel(now - e.at)} ago</div>
            </div>
            <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 15, color: e.ptsDelta > 0 ? WIN : OX }}>{e.ptsDelta > 0 ? "+" : ""}{fmt(e.ptsDelta)}</div>
          </div>
        );
      })}
    </Card>
  );
}

// ---------- app ----------
function App() {
  const cfg = CONFIG;
  const [data, setData] = useState(null), [dataErr, setDataErr] = useState(""), [dataBusy, setDataBusy] = useState(false), [dataCached, setDataCached] = useState(false);
  const [lg, setLg] = useState("sleeper"), [view, setView] = useState("matchup");
  const [sl, setSl] = useState(null), [slErr, setSlErr] = useState(""), [slBusy, setSlBusy] = useState(false);
  const [kickRaw, setKick] = useState(null), [ahead, setAhead] = useState(null), [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [fullSchedule, setFullSchedule] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Games tab: full NFL slate for a chosen week
  const [gamesWeek, setGamesWeek] = useState(null);
  const [weekGames, setWeekGames] = useState(null), [weekGamesBusy, setWeekGamesBusy] = useState(false), [weekGamesErr, setWeekGamesErr] = useState("");
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  // Matchup/Team tabs (Sleeper only): browse a fantasy week other than the live one
  const [rosterWeek, setRosterWeek] = useState(null);
  const [weekMatch, setWeekMatch] = useState(null), [weekMatchBusy, setWeekMatchBusy] = useState(false), [weekMatchErr, setWeekMatchErr] = useState("");
  const [weekKick, setWeekKick] = useState(null);
  const [rosterPickerOpen, setRosterPickerOpen] = useState(false);
  // team-schedule modal: opened by clicking any TeamAbbrev
  const [teamScheduleFor, setTeamScheduleFor] = useState(null);
  const [teamScheduleRows, setTeamScheduleRows] = useState(null), [teamScheduleBusy, setTeamScheduleBusy] = useState(false), [teamScheduleErr, setTeamScheduleErr] = useState("");
  // player-stats modal: opened by clicking a player row
  const [playerStatsFor, setPlayerStatsFor] = useState(null);
  const [playerStatsRows, setPlayerStatsRows] = useState(null), [playerStatsBusy, setPlayerStatsBusy] = useState(false), [playerStatsErr, setPlayerStatsErr] = useState("");
  // Yahoo (screenshot-derived) roster rows carry no Sleeper player_id — resolve one by name/team once per data refresh
  const [yahooIdIndex, setYahooIdIndex] = useState({}); // "name|team" -> sleeper player_id
  const [resolvedPlayers, setResolvedPlayers] = useState({}); // sleeper player_id -> {name, team, pos}, for ids not in sl.players
  // live matchup timeline (Feature 4): accumulated stat-delta entries for the active league/week
  const [timelineEntries, setTimelineEntries] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [dark, setDark] = useState(() => { const s = store.get("wr_dark"); return s == null ? matchMedia("(prefers-color-scheme: dark)").matches : !!s; });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    store.set("wr_dark", dark);
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", dark ? "#0B0D12" : "#14213D");
  }, [dark]);

  const yahooRaw = data?.yahoo || null;
  const brief = data?.brief || null, waivers = data?.waivers || null, trades = data?.trades || null;
  const newsAvailable = Array.isArray(data?.news);
  const news = data?.news || [];
  const playerNews = useMemo(() => {
    if (!playerStatsFor) return [];
    const key = normName(playerStatsFor.name);
    return news.filter(n => normName(n.player) === key);
  }, [news, playerStatsFor]);
  const lineup = data?.lineup || {};
  const analysis = data?.analysis || {};
  // TV/streaming network, in priority order: the baked-in season schedule (straight off the NFL's official
  // release), then data.json's broadcasts (the scheduled task's day-of catch for flex games the season table
  // has as null), then whatever ESPN's own undocumented broadcast fields happened to return.
  const kick = useMemo(() => {
    if (!kickRaw) return kickRaw;
    const wk = sl?.week ?? data?.week ?? null;
    const staticBc = wk != null ? BROADCASTS_BY_WEEK[wk] : null;
    const dailyBc = data?.broadcasts;
    if (!staticBc && !dailyBc) return kickRaw;
    const out = {};
    Object.entries(kickRaw).forEach(([team, k]) => {
      const tv = staticBc?.[team] || dailyBc?.[team] || k.tv;
      out[team] = tv !== k.tv ? { ...k, tv } : k;
    });
    return out;
  }, [kickRaw, data, sl]);

  const refreshData = useCallback(async () => {
    setDataBusy(true); setDataErr("");
    try {
      const d = await loadData();
      setData(d); setDataCached(false);
      store.set("wr_last_data", d); // overwritten in place each success — never grows
    } catch (e) {
      const cached = store.get("wr_last_data");
      if (cached) { setData(cached); setDataCached(true); setDataErr(`Can't reach data.json (${e.message}) — showing the last copy saved on this device.`); }
      else { setDataErr(e.message); }
    }
    setDataBusy(false);
  }, []);
  const refreshSleeper = useCallback(async () => {
    setSlBusy(true); setSlErr("");
    try {
      const d = await loadSleeper(cfg); setSl(d);
      loadKickoffs(d.season, d.week).then(setKick).catch(() => {});
      loadStats(d.season, d.week).then(setStats).catch(() => {});
      loadSeasonSchedule(d.season).then(setAhead).catch(() => {});
      loadHistory(d).then(setHistory).catch(() => {});
      loadFullSchedule(d).then(setFullSchedule).catch(() => {});
    } catch (e) { setSlErr(e.message); }
    setSlBusy(false);
  }, []);
  useEffect(() => {
    refreshData(); refreshSleeper();
    const onVis = () => { if (document.visibilityState === "visible") { setNow(Date.now()); refreshData(); refreshSleeper(); } };
    document.addEventListener("visibilitychange", onVis);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(tick); };
  }, []);

  const my = useMemo(() => sl ? slRows(sl, sl.myRoster, sl.myMatch) : { starters: [], bench: [] }, [sl]);
  const yahoo = useMemo(() => {
    if (!yahooRaw) return null;
    const starters = yahooLive(yahooRaw.starters || [], stats, kick, now), opp = yahooLive(yahooRaw.opp || [], stats, kick, now), bench = yahooLive(yahooRaw.bench || [], stats, kick, now);
    const liveAny = [...starters, ...opp].some(r => r.live);
    const tot = rows => rows.reduce((a, r) => a + (r.live ? r.pts : (r.pts || 0)), 0);
    return { ...yahooRaw, starters, opp, bench, live: liveAny, myPts: liveAny ? +tot(starters).toFixed(2) : yahooRaw.myPts, oppPts: liveAny ? +tot(opp).toFixed(2) : yahooRaw.oppPts };
  }, [yahooRaw, stats, kick, now]);
  const anyLive = useMemo(() => {
    const teams = new Set([...(sl?.myRoster?.starters || []).map(id => sl.players[id]?.team), ...(yahoo?.starters || []).map(r => r.team), ...(yahoo?.opp || []).map(r => r.team)]);
    return [...teams].some(t => t && gameState(kick, t, now).phase === "live");
  }, [sl, yahoo, kick, now]);
  useEffect(() => {
    if (!anyLive || document.visibilityState !== "visible") return;
    const t = setInterval(() => { if (document.visibilityState === "visible") refreshSleeper(); }, 60000);
    return () => clearInterval(t);
  }, [anyLive]);
  useEffect(() => {
    if (!anyLive || !sl || document.visibilityState !== "visible") return;
    const t = setInterval(() => { if (document.visibilityState === "visible") loadKickoffs(sl.season, sl.week, true).then(setKick).catch(() => {}); }, 20000);
    return () => clearInterval(t);
  }, [anyLive, sl]);
  const opp = useMemo(() => sl?.oppRoster ? slRows(sl, sl.oppRoster, sl.oppMatch) : { starters: [], bench: [] }, [sl]);
  const week = sl?.week ?? data?.week ?? null;

  // Games tab: default to the current week once known, then fetch/refetch whenever the tab is open and the
  // selected week (or season) changes. While the selected week is the live week, keep it fresh like everything else live.
  useEffect(() => { if (gamesWeek == null && week != null) setGamesWeek(week); }, [week]);
  useEffect(() => {
    if (view !== "games" || !sl || gamesWeek == null) return;
    let cancelled = false;
    setWeekGamesBusy(true); setWeekGamesErr("");
    loadWeekGames(sl.season, gamesWeek).then(g => { if (!cancelled) setWeekGames(g); })
      .catch(e => { if (!cancelled) setWeekGamesErr(e.message); })
      .finally(() => { if (!cancelled) setWeekGamesBusy(false); });
    return () => { cancelled = true; };
  }, [view, sl, gamesWeek]);
  useEffect(() => {
    if (view !== "games" || !anyLive || !sl || gamesWeek !== sl.week || document.visibilityState !== "visible") return;
    const t = setInterval(() => { if (document.visibilityState === "visible") loadWeekGames(sl.season, gamesWeek, true).then(setWeekGames).catch(() => {}); }, 20000);
    return () => clearInterval(t);
  }, [view, anyLive, sl, gamesWeek]);

  // Matchup/Team tabs: default the browsed week to the live one, then fetch that week's actual rosters/points
  // whenever it's not the live week (the live week already has this data loaded via `sl`). Kickoff/opponent/TV
  // metadata is fetched per browsed week too (loadKickoffs works for any past or future week, not just the
  // current one) so the roster rows show the same opponent/time detail regardless of which week is open.
  useEffect(() => { if (rosterWeek == null && sl?.week != null) setRosterWeek(sl.week); }, [sl?.week]);
  useEffect(() => {
    if (!sl || rosterWeek == null || rosterWeek === sl.week) { setWeekMatch(null); setWeekKick(null); return; }
    let cancelled = false;
    setWeekMatchBusy(true); setWeekMatchErr("");
    loadWeekMatchup(sl, rosterWeek).then(r => { if (!cancelled) setWeekMatch(r); })
      .catch(e => { if (!cancelled) setWeekMatchErr(e.message); })
      .finally(() => { if (!cancelled) setWeekMatchBusy(false); });
    loadKickoffs(sl.season, rosterWeek).then(k => { if (!cancelled) setWeekKick(k); }).catch(() => {});
    return () => { cancelled = true; };
  }, [sl, rosterWeek]);

  // team-schedule modal: fetch on open
  useEffect(() => {
    if (!teamScheduleFor || !sl) return;
    let cancelled = false;
    setTeamScheduleBusy(true); setTeamScheduleErr(""); setTeamScheduleRows(null);
    loadTeamSchedule(teamScheduleFor, sl.season, sl.week).then(r => { if (!cancelled) setTeamScheduleRows(r); })
      .catch(e => { if (!cancelled) setTeamScheduleErr(e.message); })
      .finally(() => { if (!cancelled) setTeamScheduleBusy(false); });
    return () => { cancelled = true; };
  }, [teamScheduleFor, sl]);

  // player-stats modal: fetch on open; Yahoo rows resolve to a Sleeper id first via yahooIdIndex
  useEffect(() => {
    if (!playerStatsFor || !sl) return;
    const id = playerStatsFor.id || yahooIdIndex[`${playerStatsFor.name}|${playerStatsFor.team}`];
    if (!id) { setPlayerStatsRows(null); setPlayerStatsErr("Couldn't match this player to a Sleeper ID — try again once the roster's fully loaded, or the name/team may not match."); return; }
    let cancelled = false;
    setPlayerStatsBusy(true); setPlayerStatsErr(""); setPlayerStatsRows(null);
    loadPlayerSeasonStats(id, sl.season, sl.week, sl.league.scoring_settings).then(r => { if (!cancelled) setPlayerStatsRows(r); })
      .catch(e => { if (!cancelled) setPlayerStatsErr(e.message); })
      .finally(() => { if (!cancelled) setPlayerStatsBusy(false); });
    return () => { cancelled = true; };
  }, [playerStatsFor, sl, yahooIdIndex]);

  // resolve Yahoo (screenshot-derived) roster rows to Sleeper player_ids once per Yahoo data refresh, so the
  // player-stats modal and the live timeline can look them up by name the same way live Yahoo scoring already does
  useEffect(() => {
    const rows = [...(yahooRaw?.starters || []), ...(yahooRaw?.opp || [])];
    if (!rows.length) return;
    let cancelled = false;
    loadAllPlayersIndex().then(byName => {
      if (cancelled) return;
      const idx = {}, resolved = {};
      rows.forEach(r => { const id = resolvePlayerId(byName, r); if (id) { idx[`${r.name}|${r.team}`] = id; resolved[id] = { name: r.name, team: r.team, pos: r.pos }; } });
      setYahooIdIndex(idx); setResolvedPlayers(resolved);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [yahooRaw]);

  // live matchup timeline: piggyback on the existing live-stat refresh (loadStats -> setStats, above) rather than
  // running a separate poll — diff the new snapshot against the last one seen for this league/week and persist
  // both the running entry list and the raw snapshot so a partial timeline survives reloads/tab-closes mid-game.
  const timelinePlayerIds = useMemo(() => {
    if (lg === "sleeper") return [...(sl?.myRoster?.starters || []), ...(sl?.oppRoster?.starters || [])];
    return [...(yahooRaw?.starters || []), ...(yahooRaw?.opp || [])].map(r => yahooIdIndex[`${r.name}|${r.team}`]).filter(Boolean);
  }, [lg, sl, yahooRaw, yahooIdIndex]);
  useEffect(() => {
    if (!stats || !sl) return;
    const key = `wr_timeline_${lg}_${sl.season}_${sl.week}`;
    const stored = store.get(key) || { lastSnapshot: null, entries: [] };
    if (stored.lastSnapshot) {
      const fresh = diffStatSnapshots(stored.lastSnapshot, stats.byId, timelinePlayerIds, Date.now());
      if (fresh.length) stored.entries = [...stored.entries, ...fresh].slice(-300);
    }
    stored.lastSnapshot = stats.byId;
    store.set(key, stored);
    setTimelineEntries(stored.entries);
  }, [stats, lg, sl, timelinePlayerIds]);

  // Yahoo staleness
  const yahooAge = useMemo(() => { if (!yahooRaw?.updatedAt) return null; const d = new Date(yahooRaw.updatedAt + "T12:00:00"); return isNaN(d) ? null : Math.floor((now - d.getTime()) / 864e5); }, [yahooRaw, now]);
  const yahooStale = yahooRaw && ((yahooAge != null && yahooAge > 2) || (week && yahooRaw.week && yahooRaw.week < week));

  // Pipeline health: the scheduled task writes data.json daily 7am PT (+ Sunday 9am PT).
  // Only fires when data.json itself loaded fine but its content is old — a signal the task didn't run,
  // as opposed to dataErr/dataCached which mean the file couldn't be reached at all.
  const PIPELINE_STALE_MS = 27 * 3600e3;
  const pipelineAgeMs = useMemo(() => data?.updatedAt ? now - new Date(data.updatedAt).getTime() : null, [data, now]);
  const pipelineStale = !dataCached && pipelineAgeMs != null && pipelineAgeMs > PIPELINE_STALE_MS;

  // next lock across both leagues' starters
  const nextLock = useMemo(() => {
    const all = [...my.starters.map(r => ({ ...r, teamName: cfg.sleeperTeamName })), ...(yahoo?.starters || []).map(r => ({ ...r, teamName: cfg.yahooTeamName }))];
    const up = all.map(r => ({ r, g: gameState(kick, r.team, now) })).filter(x => x.g.at && x.g.at.getTime() > now).sort((a, b) => a.g.at - b.g.at);
    if (!up.length) return null;
    const first = up[0], same = up.filter(x => x.g.at.getTime() === first.g.at.getTime());
    return { at: first.g.at, soon: first.g.at.getTime() - now < LOCK_SOON_MS, names: same.map(x => `${shortName(x.r.name, x.r.pos)} (${x.r.teamName})`) };
  }, [my, yahoo, kick, now, cfg]);
  const lockedSoonQ = useMemo(() => [...my.starters, ...(yahoo?.starters || [])].filter(r => r.status && gameState(kick, r.team, now).phase === "soon"), [my, yahoo, kick, now]);

  const doNow = brief?.text ? (brief.text.match(/^Do now:\s*(.+)$/gm) || []).map(l => l.replace(/^Do now:\s*/, "")) : [];
  const firstLine = brief?.text?.split("\n")[0] || "";
  const urgent = (firstLine && firstLine === firstLine.toUpperCase() && !/^GANGSTAS|^GAME OF/.test(firstLine)) || lockedSoonQ.length > 0;
  const showDoNow = doNow.length > 0 && (urgent || doNow.some(d => !/^nothing/i.test(d)));
  const contingency = useMemo(() => { const m = {}; Object.values(lineup).flat().forEach(r => { if (r?.ifOut) m[r.name.toLowerCase()] = r.ifOut; }); return m; }, [lineup]);

  const season = useMemo(() => {
    const rows = [...(data?.season || [])];
    history.forEach(h => { const i = rows.findIndex(r => r.league === "Sleeper" && r.week === h.week); if (i >= 0) rows[i] = { ...h, ...rows[i], me: h.me, opp: h.opp, result: h.result, bench: rows[i].bench || h.bench }; else rows.push(h); });
    return rows.sort((a, b) => a.week - b.week || a.league.localeCompare(b.league));
  }, [data, history]);
  const seasonMd = () => `| Wk | League | Me | Opp | W/L | Record | Bench pts | Lesson |\n|---|---|---|---|---|---|---|---|\n${season.map(r => `| ${r.week} | ${r.league} | ${r.me} | ${r.opp} | ${r.result} | ${r.record || ""} | ${r.bench || ""} | ${r.lesson || ""} |`).join("\n")}`;

  const tone = lg === "sleeper" ? INK : OX;
  const myRec = sl ? `${sl.myRoster.settings.wins}-${sl.myRoster.settings.losses}` : "";
  const oppRec = sl?.oppRoster ? `${sl.oppRoster.settings.wins}-${sl.oppRoster.settings.losses}` : "";

  // Matchup/Team (Sleeper): ‹ Week N › nav shared by both tabs, plus the props for whichever week is browsed —
  // the live week reuses the already-loaded sl/my/opp data, any other week uses the separately fetched weekMatch
  // (and weekKick for that week's opponent/kickoff/TV detail). A future browsed week is treated like the live
  // week for display purposes (`final: false`) since it hasn't been played yet — only a genuinely past week is
  // "final" (box score only, no projections).
  const rosterIsLive = !sl || rosterWeek == null || rosterWeek === sl.week;
  const rosterKick = rosterIsLive ? kick : weekKick;
  const weekUpcoming = weekMatch ? weekMatch.upcoming : (sl && rosterWeek != null && rosterWeek > sl.week);
  const rosterNav = sl ? { week: rosterWeek ?? sl.week, min: 1, max: 18, onChange: setRosterWeek, onOpenPicker: () => setRosterPickerOpen(true) } : null;
  const rosterMatchupProps = rosterIsLive
    ? { oppName: sl?.oppUser?.metadata?.team_name || sl?.oppUser?.display_name, oppRec, mine: my.starters, theirs: opp.starters,
        myPts: sl?.myMatch?.points ?? 0, oppPts: sl?.oppMatch?.points ?? 0, myProj: sum(my.starters, "proj"), oppProj: sum(opp.starters, "proj"),
        sub: sl ? `Week ${sl.week}` : "", final: false }
    : { oppName: weekMatch?.oppName, oppRec: weekMatch?.oppRec || "", mine: weekMatch?.my?.starters || [], theirs: weekMatch?.opp?.starters || [],
        myPts: weekMatch?.myPts ?? null, oppPts: weekMatch?.oppPts ?? null,
        myProj: weekUpcoming ? sum(weekMatch?.my?.starters || [], "proj") : null,
        oppProj: weekUpcoming ? sum(weekMatch?.opp?.starters || [], "proj") : null,
        sub: `Week ${rosterWeek}`, final: !weekUpcoming };
  const rosterTeamProps = rosterIsLive
    ? { starters: my.starters, bench: my.bench, contingency, ahead, final: false }
    : { starters: weekMatch?.my?.starters || [], bench: weekMatch?.my?.bench || [], contingency: null, ahead: null, final: !weekUpcoming };

  // Matchup/Team (Yahoo): shares the same `rosterWeek`/`rosterNav` as Sleeper above, so flipping weeks moves both
  // tabs together. Yahoo has no live API to replay a past week from — data.json's scheduled task instead archives
  // each week's roster snapshot into `yahoo.history` as it happens (see cowork-task-prompt.md). Browsing to a week
  // strictly before Yahoo's latest known week reads that archive; browsing at/after it just keeps showing the
  // latest known roster (today's behavior, staleness banner included), since nothing more recent exists yet.
  const yahooCurrentWeek = yahooRaw?.week ?? null;
  const yahooHistKey = rosterWeek != null && yahooCurrentWeek != null && rosterWeek < yahooCurrentWeek ? String(rosterWeek) : null;
  const yahooHist = yahooHistKey ? data?.yahoo?.history?.[yahooHistKey] : null;
  const rosterYahooMatchupProps = yahooHistKey
    ? { oppName: yahooHist?.opponent, oppRec: yahooHist?.oppRecord || "", mine: yahooHist?.starters || [], theirs: yahooHist?.opp || [],
        myPts: yahooHist?.myPts ?? null, oppPts: yahooHist?.oppPts ?? null, myProj: null, oppProj: null,
        sub: `Week ${rosterWeek}`, final: true }
    : { oppName: yahoo?.opponent, oppRec: yahoo?.oppRecord, mine: yahoo?.starters || [], theirs: yahoo?.opp || [],
        myPts: yahoo?.myPts, oppPts: yahoo?.oppPts, myProj: yahoo?.myProj ?? sum(yahoo?.starters || [], "proj"), oppProj: yahoo?.oppProj ?? sum(yahoo?.opp || [], "proj"),
        sub: yahoo?.live ? `Wk ${yahoo.week} · live est.` : `Week ${yahoo?.week}${yahoo?.winProb ? " · " + yahoo.winProb : ""}`, final: false };
  const rosterYahooTeamProps = yahooHistKey
    ? { starters: yahooHist?.starters || [], bench: yahooHist?.bench || [], contingency: null, ahead: null, final: true }
    : { starters: yahoo?.starters || [], bench: yahoo?.bench || [], contingency, ahead, final: false };
  const yahooHistMissing = yahooHistKey && !yahooHist;

  const tabs = [["matchup", "Matchup"], ["team", "Team"], ["league", "League"], ["brief", "Brief"], ["games", "Games"], ["timeline", "Live"], ...(season.length ? [["season", "Season"]] : [])];
  const yahooEmpty = <Card><Empty>No Yahoo data yet. Drop roster + matchup screenshots in the "War room" Drive folder; the next scheduled run reads them.</Empty></Card>;
  const openPlayer = r => setPlayerStatsFor({ id: r.id, name: r.name, team: r.team, pos: r.pos });
  const openTeam = team => setTeamScheduleFor(team);
  const timelinePlayers = { ...(sl?.players || {}), ...resolvedPlayers };
  const timelineMyIds = new Set(lg === "sleeper" ? (sl?.myRoster?.starters || []) : (yahooRaw?.starters || []).map(r => yahooIdIndex[`${r.name}|${r.team}`]).filter(Boolean));
  const timelineScoring = lg === "sleeper" ? (sl?.league?.scoring_settings || {}) : YAHOO_SCORING;
  const timelineLive = lg === "sleeper"
    ? (sl?.myRoster?.starters || []).some(id => gameState(kick, sl.players[id]?.team, now).phase === "live") || (sl?.oppRoster?.starters || []).some(id => gameState(kick, sl.players[id]?.team, now).phase === "live")
    : [...(yahooRaw?.starters || []), ...(yahooRaw?.opp || [])].some(r => gameState(kick, r.team, now).phase === "live");

  return (
    <div style={{ fontFamily: font, background: FIELD, minHeight: "100vh", color: TEXT }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "12px 12px calc(150px + env(safe-area-inset-bottom))" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 26, lineHeight: 1, letterSpacing: -0.5 }}>War room</div>
            <div style={{ fontSize: 13, color: MUTE, marginTop: 3 }}>
              {sl ? `Week ${sl.week} · ${sl.season}` : slBusy ? "Loading Sleeper…" : "Sleeper offline"} · {data ? `brief ${stamp(data.updatedAt)}${dataCached ? " (cached)" : ""}` : dataBusy ? "loading data…" : "no data yet"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Btn ghost small tone={MUTE} ariaLabel={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setDark(d => !d)}>
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </Btn>
            <Btn ghost small tone={MUTE} onClick={() => { setNow(Date.now()); refreshData(); refreshSleeper(); }} disabled={slBusy || dataBusy}>
              <RefreshCw size={14} style={{ animation: slBusy || dataBusy ? "spin 1s linear infinite" : "none" }} />Refresh
            </Btn>
          </div>
        </div>

        {/* next lock strip */}
        {nextLock && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: nextLock.soon ? FLAG : PAPER, borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 13, color: nextLock.soon ? FLAG_TEXT : TEXT }}>
            <div style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><span style={{ fontFamily: cond, fontWeight: 700 }}>Next lock</span> · {nextLock.names.length <= 2 ? nextLock.names.join(", ") : `${nextLock.names.length} starters`}</div>
            <div style={{ fontFamily: cond, fontWeight: 800, whiteSpace: "nowrap" }}>{kickLabel(nextLock.at)} · in {rel(nextLock.at.getTime() - now)}</div>
          </div>
        )}

        {/* do now */}
        {showDoNow && (
          <div style={{ background: urgent ? FLAG : PAPER, borderRadius: 10, padding: "12px 14px", marginBottom: 10, color: urgent ? FLAG_TEXT : TEXT }}>
            {firstLine === firstLine.toUpperCase() && !/^GANGSTAS|^GAME OF/.test(firstLine) && <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{firstLine}</div>}
            {lockedSoonQ.length > 0 && <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 17, marginBottom: 6, lineHeight: 1.25 }}>{lockedSoonQ.length} questionable starter{lockedSoonQ.length > 1 ? "s" : ""} lock{lockedSoonQ.length > 1 ? "" : "s"} {gameState(kick, lockedSoonQ[0].team, now).text}: {lockedSoonQ.map(r => shortName(r.name, r.pos)).join(", ")} — check inactives</div>}
            <div style={{ fontSize: 12, color: urgent ? "#7A5A00" : MUTE, marginBottom: 4 }}>Do now · {stamp(brief.at)}</div>
            {doNow.map((d, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "5px 1fr", gap: 10, marginTop: 4 }}><div style={{ background: i === 0 ? INK : OX, borderRadius: 3 }} /><div style={{ fontFamily: cond, fontWeight: 600, fontSize: 17, lineHeight: 1.25 }}>{d}</div></div>)}
          </div>
        )}

        {yahooStale && <div style={{ background: OX, color: "#fff", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 10, fontFamily: cond, fontWeight: 600 }}>Yahoo data is {yahooAge} days old (screenshots from {yahoo.updatedAt}{yahoo.week && week && yahoo.week < week ? `, Week ${yahoo.week}` : ""}). Drop fresh roster + matchup screenshots in Drive before kickoff.</div>}
        {pipelineStale && <div style={{ background: OX, color: "#fff", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 10, fontFamily: cond, fontWeight: 600 }}>Scheduled task hasn't written new data in {Math.floor(pipelineAgeMs / 3600e3)}h (last update {stamp(data.updatedAt)}). Check that the Cowork task ran.</div>}
        {dataErr && <div style={{ background: "#FFF6D6", border: `1px solid ${FLAG}`, borderRadius: 6, padding: "10px 12px", fontSize: 14, marginBottom: 10, color: FLAG_TEXT }}>{dataErr}</div>}
        {slErr && <div style={{ background: "#FDECEC", border: "1px solid #E8A9A9", borderRadius: 6, padding: "10px 12px", fontSize: 14, marginBottom: 10, color: FLAG_TEXT }}>Sleeper: {slErr}</div>}

        {view === "matchup" && lg === "sleeper" && (sl
          ? <Matchup tone={INK} meName={cfg.sleeperTeamName} meRec={myRec} kick={rosterKick} now={now} nav={rosterNav}
              {...rosterMatchupProps} onPlayerClick={openPlayer} onTeamClick={openTeam}
              action={!rosterIsLive && weekMatchErr ? <Empty>{weekMatchErr}</Empty> : undefined} />
          : <Card><Empty>{slBusy ? "Loading your Sleeper matchup…" : "Sleeper didn't load."}</Empty></Card>)}
        {view === "matchup" && lg === "yahoo" && (yahoo
          ? <Matchup tone={OX} meName={cfg.yahooTeamName} meRec={yahoo.record}
              kick={rosterKick} now={now} nav={rosterNav} {...rosterYahooMatchupProps}
              onPlayerClick={openPlayer} onTeamClick={openTeam}
              action={yahooHistMissing
                ? <Empty>No archived Yahoo roster for Week {rosterWeek} yet — the scheduled task now saves each week's screenshot data, so this fills in going forward.</Empty>
                : (yahooHistKey ? undefined : <div style={{ fontSize: 12, color: MUTE }}>Roster, projections and injury tags from screenshots dated {yahoo.updatedAt}. Points during games are computed from Sleeper's live stat feed with Game of Throws scoring — they track Yahoo within stat corrections. Drop new Yahoo screenshots in the "War room" Drive folder to update the roster.</div>)} />
          : yahooEmpty)}

        {view === "team" && lg === "sleeper" && (sl
          ? <Team tone={INK} name={cfg.sleeperTeamName} meta={`${myRec} · ${sl.league.settings.waiver_type === 2 ? `FAAB $${sl.standings.find(x => x.mine)?.faab} left` : "priority waivers"} · ${sl.league.scoring_settings?.rec >= 1 ? "PPR" : sl.league.scoring_settings?.rec >= 0.5 ? "half PPR" : "standard"}`}
              kick={rosterKick} now={now} week={sl.week} nav={rosterNav} {...rosterTeamProps} onPlayerClick={openPlayer} onTeamClick={openTeam}
              action={!rosterIsLive && weekMatchErr ? <Empty>{weekMatchErr}</Empty> : undefined} />
          : <Card><Empty>Sleeper not loaded.</Empty></Card>)}
        {view === "team" && lg === "yahoo" && (yahoo
          ? <Team tone={OX} name={cfg.yahooTeamName} meta={`${yahoo.record || ""} · half PPR · from screenshots ${yahoo.updatedAt}`}
              kick={rosterKick} now={now} week={week} nav={rosterNav} {...rosterYahooTeamProps} onPlayerClick={openPlayer} onTeamClick={openTeam}
              action={yahooHistMissing ? <Empty>No archived Yahoo roster for Week {rosterWeek} yet.</Empty> : undefined} />
          : yahooEmpty)}

        {view === "games" && (
          <GamesView week={gamesWeek ?? week ?? 1} games={weekGames} busy={weekGamesBusy} err={weekGamesErr} now={now}
            onWeekChange={setGamesWeek} onOpenPicker={() => setWeekPickerOpen(true)} onTeamClick={openTeam} />
        )}

        {view === "timeline" && (
          <MatchupTimeline tone={tone} entries={timelineEntries} players={timelinePlayers} scoring={timelineScoring}
            myIds={timelineMyIds} now={now} live={timelineLive} />
        )}

        {view === "league" && lg === "sleeper" && (sl ? <>
          <Standings tone={INK} rows={sl.standings} faab={sl.league.settings.waiver_type === 2} />
          <Card style={{ marginTop: 10 }}>
            <H tone={INK} style={{ marginBottom: 6 }}>Moves this week</H>
            {sl.transactions.length === 0 ? <Empty>No transactions yet this week.</Empty> : sl.transactions.slice(0, 20).map((t, i) => (
              <div key={i} style={{ fontSize: 14, padding: "5px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
                <span style={{ fontFamily: cond, fontWeight: 600, color: MUTE }}>{t.type}{t.settings?.waiver_bid ? ` $${t.settings.waiver_bid}` : ""}</span> · {t.roster_ids?.map(r => sl.userBy[r]?.metadata?.team_name || sl.userBy[r]?.display_name).join(" ↔ ")}<br />
                {Object.keys(t.adds || {}).length > 0 && <span style={{ color: WIN }}>+ {Object.keys(t.adds).map(p => sl.players[p]?.name).join(", ")}</span>} {Object.keys(t.drops || {}).length > 0 && <span style={{ color: OX }}>− {Object.keys(t.drops).map(p => sl.players[p]?.name).join(", ")}</span>}
              </div>))}
          </Card>
          <Card style={{ marginTop: 10 }}>
            <H tone={INK} style={{ marginBottom: 6 }}>Hot on the wire, not rostered here</H>
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>{sl.trending.filter(t => !sl.rostered.has(t.player_id)).slice(0, 12).map(t => `${sl.players[t.player_id]?.name} (${sl.players[t.player_id]?.pos} ${sl.players[t.player_id]?.team}) +${t.count}`).join(" · ") || "nothing"}</div>
          </Card>
          <Rules tone={INK} style={{ marginTop: 10 }} rows={[
            ["Scoring", `${sl.league.scoring_settings?.rec >= 1 ? "full PPR" : sl.league.scoring_settings?.rec >= 0.5 ? "half PPR" : "standard"} · pass TD ${sl.league.scoring_settings?.pass_td ?? 4} · FG 40+ ${sl.league.scoring_settings?.fgm_40_49 ?? 3}/50+ ${sl.league.scoring_settings?.fgm_50p ?? 3}`],
            ["Slots", sl.league.roster_positions.filter(x => x !== "BN" && x !== "IR").join(" · ") + ` · ${sl.league.roster_positions.filter(x => x === "BN").length} BN · ${sl.league.roster_positions.filter(x => x === "IR").length} IR`],
            ["Waivers", sl.league.settings.waiver_type === 2 ? `FAAB $${sl.league.settings.waiver_budget} — you have $${sl.standings.find(x => x.mine)?.faab} left · clears ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(sl.league.settings.waiver_day_of_week ?? 2)] || "Wed"}` : "priority"],
            ["Trade deadline", `week ${sl.league.settings.trade_deadline}${sl.league.settings.trade_deadline >= sl.week ? ` — ${sl.league.settings.trade_deadline - sl.week + 1} week${sl.league.settings.trade_deadline - sl.week + 1 === 1 ? "" : "s"} left` : " — passed"}`],
            ["Playoffs", `start week ${sl.league.settings.playoff_week_start} · ${sl.league.settings.playoff_teams} teams`],
          ]} />
        </> : <Card><Empty>Sleeper not loaded.</Empty></Card>)}
        {view === "league" && lg === "yahoo" && (yahoo ? <>
          <Standings tone={OX} rows={(yahoo.standings || []).map(s => ({ ...s, mine: (s.team || "").toLowerCase() === cfg.yahooTeamName.toLowerCase() }))} />
          <Card style={{ marginTop: 10 }}><div style={{ fontSize: 12, color: MUTE }}>Add a screenshot of Yahoo's Standings page to the Drive folder to fill this in.</div></Card>
          <Rules tone={OX} style={{ marginTop: 10 }} rows={[["Scoring", YAHOO_RULES.scoring], ["Slots", YAHOO_RULES.slots], ["Waivers", YAHOO_RULES.waivers], ["Trade deadline", YAHOO_RULES.tradeDeadline], ["Playoffs", YAHOO_RULES.playoffs]]} />
        </> : yahooEmpty)}

        {view === "brief" && <>
          <Collapsible tone={tone} title="Lineup" defaultOpen={false}>
            <LineupCard rows={lineup[lg]} kick={kick} now={now} />
          </Collapsible>
          <Collapsible tone={tone} title="Brief" defaultOpen={false}>
            {brief ? <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                <div style={{ fontSize: 12, color: MUTE }}>{brief.mode || "daily"} brief · {stamp(brief.at)}</div><CopyBtn text={brief.text} />
              </div>
              <Report text={brief.text} />
            </> : <Empty>No brief yet. The scheduled task writes one every morning at 7 AM and again Sunday 9 AM Pacific.</Empty>}
          </Collapsible>
          <Collapsible tone={tone} title="Analysis" defaultOpen={false}>
            {lg === "sleeper" ? <Analysis tone={INK} rows={analysis.sleeper} />
              : (yahoo ? <Analysis tone={OX} rows={analysis.yahoo} /> : <Empty>No Yahoo data yet. Drop roster + matchup screenshots in the "War room" Drive folder; the next scheduled run reads them.</Empty>)}
          </Collapsible>
          <Collapsible tone={tone} title="Moves" defaultOpen={false}>
            <div style={{ display: "grid", gap: 10 }}>
              <H tone={tone}>Waivers</H>
              <Section item={waivers} empty="Waiver plans are written on Tuesday and Wednesday runs." />
              <H tone={tone}>Trades</H>
              <Section item={trades} empty={`Trade ideas are written on Tuesday runs. To get a proposal evaluated, put a note named "trade.txt" in the Drive folder.`} />
            </div>
          </Collapsible>
        </>}

        {view === "season" && <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}><CopyBtn text={seasonMd()} /></div>
          <Card style={{ padding: 8, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ fontFamily: cond, color: MUTE, textAlign: "left" }}>{["Wk", "League", "Me", "Opp", "", "Rec", "Bench", "Lesson"].map((h, i) => <th key={i} style={{ padding: "4px 6px", borderBottom: `1px solid ${LINE}`, fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>{season.map((r, i) => <tr key={i} style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
                <td style={{ padding: 6 }}>{r.week}</td>
                <td style={{ padding: 6, color: r.league === "Sleeper" ? INK : OX, fontWeight: 600 }}>{r.league}</td>
                <td style={{ padding: 6 }}>{r.me}</td><td style={{ padding: 6 }}>{r.opp}</td>
                <td style={{ padding: 6, fontWeight: 700, color: r.result === "W" ? WIN : OX }}>{r.result}</td>
                <td style={{ padding: 6 }}>{r.record}</td><td style={{ padding: 6, whiteSpace: "nowrap" }}>{r.bench}</td>
                <td style={{ padding: 6, minWidth: 140 }}>{r.lesson}</td>
              </tr>)}</tbody>
            </table>
            <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>Sleeper scores and bench points are computed live from Sleeper; Yahoo rows and lessons come from the Tuesday run.</div>
          </Card>
        </>}

        <style>{`
          :root{--field:#E9ECF0;--paper:#fff;--mute:#5C6470;--line:#D5D9E0;--text:#1B1F27;--ink:#14213D;--ox:#6E1F2B;--win:#1E6B3A;--amber:#7A5A00;--chip-bg:#F1F3F6;--hairline:#EEF0F3;--hilite:#F7F8FA}
          :root[data-theme="dark"]{--field:#0B0D12;--paper:#171A21;--mute:#8A93A3;--line:#2B2F3A;--text:#E7E9EE;--ink:#7C93D8;--ox:#C4677A;--win:#4CAF6B;--amber:#E0B84D;--chip-bg:#232733;--hairline:#242833;--hilite:#1E2129}
          @keyframes spin{to{transform:rotate(360deg)}} button:focus-visible{outline:3px solid ${FLAG};outline-offset:2px} @media (prefers-reduced-motion:reduce){*{animation:none!important}}
        `}</style>
      </div>

      {/* bottom bar: section tabs above the league/team toggle, pinned to the bottom of the screen */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: PAPER, borderTop: `1px solid ${LINE}`, paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -2px 10px rgba(0,0,0,0.08)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 12px" }}>
          {/* tabs */}
          <div style={{ display: "flex", borderBottom: `2px solid ${LINE}` }}>
            {tabs.map(([k, l]) => <button key={k} onClick={() => setView(k)} style={{ flex: 1, fontFamily: cond, fontWeight: 700, fontSize: 15, padding: "7px 4px", background: "none", border: "none", borderBottom: `3px solid ${view === k ? tone : "transparent"}`, marginBottom: -2, color: view === k ? TEXT : MUTE, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>)}
          </div>
          {/* league / team toggle */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "8px 0" }}>
            {[["sleeper", sl?.league?.name || "Gangstas Paradise", "Sleeper · live", INK],
              ["yahoo", cfg.yahooLeagueName, yahoo ? `Yahoo · screenshots ${yahooAge === 0 ? "today" : yahooAge + "d old"}` : "Yahoo · no data", OX]].map(([k, n, s, c]) => (
              <button key={k} onClick={() => setLg(k)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, border: `2px solid ${c}`, background: lg === k ? c : "transparent", color: lg === k ? "#fff" : c, cursor: "pointer" }}>
                <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 16, lineHeight: 1.1 }}>{n}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{s}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {scheduleOpen && lg === "sleeper" && (
        <ScheduleModal tone={INK} title={`${sl?.league?.name || "Gangstas Paradise"} — Schedule`} myName={cfg.sleeperTeamName}
          rows={fullSchedule} currentWeek={sl?.week} onClose={() => setScheduleOpen(false)}
          empty={slBusy ? "Loading schedule…" : "Sleeper didn't load."} />
      )}
      {scheduleOpen && lg === "yahoo" && (
        <ScheduleModal tone={OX} title={`${cfg.yahooLeagueName} — Schedule`} myName={cfg.yahooTeamName}
          rows={yahooRaw?.schedule} currentWeek={yahoo?.week} onClose={() => setScheduleOpen(false)}
          empty={`Add a screenshot of Yahoo's schedule/matchups page to the "War room" Drive folder to fill this in.`} />
      )}
      {teamScheduleFor && (
        <TeamScheduleModal team={teamScheduleFor} rows={teamScheduleRows} busy={teamScheduleBusy} err={teamScheduleErr}
          currentWeek={sl?.week} onClose={() => setTeamScheduleFor(null)} />
      )}
      {weekPickerOpen && (
        <WeekPicker week={gamesWeek ?? week ?? 1} currentWeek={week}
          onSelect={w => { setGamesWeek(w); setWeekPickerOpen(false); }} onClose={() => setWeekPickerOpen(false)} />
      )}
      {rosterPickerOpen && (
        <WeekPicker week={rosterWeek ?? sl?.week ?? 1} currentWeek={sl?.week}
          onSelect={w => { setRosterWeek(w); setRosterPickerOpen(false); }} onClose={() => setRosterPickerOpen(false)} />
      )}
      {playerStatsFor && (
        <PlayerStatsModal player={playerStatsFor} rows={playerStatsRows} busy={playerStatsBusy} err={playerStatsErr}
          news={playerNews} newsAvailable={newsAvailable} onClose={() => setPlayerStatsFor(null)} />
      )}
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
