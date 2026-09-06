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
const ESPN_TO_SLEEPER = { WSH: "WAS", JAC: "JAX", LA: "LAR" };
const TV_SHORT = { "Prime Video": "Prime" };
async function loadKickoffs(season, week, force) {
  const key = `wr_kick_${season}_${week}`;
  const cached = store.get(key);
  if (!force && cached && Date.now() - cached.at < 6 * 3600e3) return Object.fromEntries(Object.entries(cached.map).map(([t, k]) => [t, { ...k, at: new Date(k.at) }]));
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${season}&limit=100`);
  if (!r.ok) throw new Error(`schedule ${r.status}`);
  const j = await r.json();
  const map = {};
  (j.events || []).forEach(ev => {
    const c = ev.competitions?.[0]; if (!c) return;
    const at = new Date(c.date || ev.date);
    const home = c.competitors.find(x => x.homeAway === "home"), away = c.competitors.find(x => x.homeAway === "away");
    const ab = x => { const a = x.team.abbreviation; return ESPN_TO_SLEEPER[a] || a; };
    let tv = c.broadcasts?.[0]?.names?.join("/") || c.geoBroadcasts?.find(g => g.type?.shortName === "TV")?.media?.shortName || null;
    if (tv) Object.entries(TV_SHORT).forEach(([full, short]) => { tv = tv.replace(full, short); });
    const status = c.status || ev.status;
    const state = status?.type?.state || null; // 'pre' | 'in' | 'post'
    const halftime = status?.type?.name === "STATUS_HALFTIME";
    const period = status?.period || null, clock = status?.displayClock || null;
    const hs = home?.score != null ? Number(home.score) : null, as = away?.score != null ? Number(away.score) : null;
    if (home && away) {
      map[ab(home)] = { at, opp: ab(away), home: true, tv, state, halftime, period, clock, myScore: hs, oppScore: as };
      map[ab(away)] = { at, opp: ab(home), home: false, tv, state, halftime, period, clock, myScore: as, oppScore: hs };
    }
  });
  store.set(key, { at: Date.now(), map });
  return map;
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
  try {
    const sc = league.scoring_settings || {};
    const key = sc.rec >= 1 ? "pts_ppr" : sc.rec >= 0.5 ? "pts_half_ppr" : "pts_std";
    const rows = await j(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF&order_by=${key}`);
    rows.forEach(r => { if (need.has(r.player_id)) proj[r.player_id] = { pts: scoreStats(r.stats, sc) ?? r.stats?.[key] ?? null, opp: r.opponent || null, date: r.date || null }; });
  } catch { proj = {}; }

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

// ---------- UI atoms ----------
function Btn({ children, onClick, tone = INK, disabled, ghost, small, ariaLabel }) {
  return <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} style={{ fontFamily: cond, fontWeight: 600, fontSize: small ? 14 : 16, padding: small ? "6px 12px" : "10px 16px", borderRadius: 6, border: `1.5px solid ${tone}`, background: ghost ? "transparent" : tone, color: ghost ? tone : "#fff", opacity: disabled ? 0.45 : 1, cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>{children}</button>;
}
const Card = ({ children, style }) => <div style={{ background: PAPER, borderRadius: 10, padding: 14, ...style }}>{children}</div>;
const Empty = ({ children }) => <div style={{ color: MUTE, fontSize: 15, lineHeight: 1.45 }}>{children}</div>;
const H = ({ tone, children, style }) => <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 18, color: tone, lineHeight: 1.1, ...style }}>{children}</div>;
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
function PlayerCell({ r, g, align = "left", full }) {
  if (!r) return <div style={{ color: MUTE }}>—</div>;
  const done = g?.phase === "final";
  const oppText = r.bye ? "BYE" : g?.opp ? `${g.home ? "vs" : "@"} ${g.opp}` : "";
  return (
    <div style={{ textAlign: align, minWidth: 0, opacity: done ? 0.55 : 1 }}>
      <div style={{ fontFamily: cond, fontWeight: 600, fontSize: full ? 15 : 14, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {full ? r.name : r.status && r.pos !== "DEF" ? r.name.split(/\s+/).slice(1).join(" ") : shortName(r.name, r.pos)}<Status s={r.status} />
        {r.pos !== "DEF" && <span style={{ color: MUTE, fontWeight: 500, fontSize: full ? 14 : 13 }}> · {r.team}</span>}
      </div>
      <div style={{ fontSize: 12, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {oppText}{g?.text ? <> · <Kick g={g} showTv={full} /></> : ""}
      </div>
    </div>
  );
}
const Num = ({ v, strong }) => <div style={{ fontFamily: cond, fontWeight: strong ? 700 : 500, fontSize: strong ? 15 : 13, color: strong ? TEXT : MUTE, textAlign: "center", minWidth: 32 }}>{fmt(v)}</div>;

const WeekLink = ({ week, onClick }) => week == null ? null : (
  <button onClick={onClick} style={{ fontFamily: cond, fontWeight: 700, fontSize: 13, color: MUTE, background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 2 }}>Week {week} <span style={{ fontSize: 15 }}>›</span></button>
);

function Matchup({ tone, meName, meRec, oppName, oppRec, mine, theirs, myPts, oppPts, myProj, oppProj, sub, kick, now, action, week, onWeekClick }) {
  const rows = Math.max(mine.length, theirs.length);
  const live = (myPts || 0) + (oppPts || 0) > 0 && [...mine, ...theirs].some(r => started(gameState(kick, r.team, now)));
  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div><H tone={tone}>{meName}</H><div style={{ fontSize: 12, color: MUTE }}>{meRec}</div></div>
        <div style={{ fontFamily: cond, fontWeight: 600, fontSize: 12, color: MUTE }}>vs</div>
        <div style={{ textAlign: "right" }}><H tone={TEXT}>{oppName || "—"}</H><div style={{ fontSize: 12, color: MUTE }}>{oppRec}</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "baseline", marginBottom: 2 }}>
        <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 40, lineHeight: 1, color: live && myPts > oppPts ? WIN : TEXT }}>{fmt(myPts)}</div>
        <div style={{ fontSize: 12, color: MUTE }}>{live ? "live" : "proj"}</div>
        <div style={{ fontFamily: cond, fontWeight: 800, fontSize: 40, lineHeight: 1, textAlign: "right", color: live && oppPts > myPts ? WIN : TEXT }}>{fmt(oppPts)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", fontSize: 13, color: MUTE, marginBottom: 10 }}>
        <div>proj {fmt(myProj)}</div><div>{sub}</div><div style={{ textAlign: "right" }}>proj {fmt(oppProj)}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6 }}>
        <div style={{ fontFamily: cond, fontWeight: 700, fontSize: 13, color: MUTE }}>Starters</div>
        <WeekLink week={week} onClick={onWeekClick} />
      </div>
      <div style={{ borderTop: `1px solid ${LINE}` }}>
        {Array.from({ length: rows }).map((_, i) => {
          const a = mine[i], b = theirs[i];
          const ga = a && gameState(kick, a.team, now), gb = b && gameState(kick, b.team, now);
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 36px 38px 36px 1fr", gap: 4, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
              <PlayerCell r={a} g={ga} />
              <Num v={started(ga) ? (a?.pts ?? a?.proj) : a?.proj} strong={started(ga) && a?.pts != null} />
              <Chip style={{ textAlign: "center", padding: "3px 0", fontSize: 10 }}>{a?.slot || b?.slot}</Chip>
              <Num v={started(gb) ? (b?.pts ?? b?.proj) : b?.proj} strong={started(gb) && b?.pts != null} />
              <PlayerCell r={b} g={gb} align="right" />
            </div>
          );
        })}
      </div>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </Card>
  );
}

function Team({ tone, name, meta, starters, bench, kick, now, contingency, ahead, week, action, onWeekClick }) {
  const Row = ({ r }) => {
    const g = gameState(kick, r.team, now), c = contingency?.[r.name.toLowerCase()];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 40px 40px", gap: 6, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
        <Chip style={{ textAlign: "center", padding: "3px 0", background: r.slot === "BN" || r.slot === "IR" ? "transparent" : CHIP_BG }}>{r.slot}</Chip>
        <div style={{ minWidth: 0 }}>
          <PlayerCell r={r} g={g} full />
          {c && <div style={{ marginTop: 3 }}><Chip tone="#7A5A00" bg="#FFF6D6">if out → {c}</Chip></div>}
        </div>
        <Num v={r.proj} /><Num v={started(g) ? r.pts : null} strong={started(g)} />
      </div>
    );
  };
  const weeks = [1, 2, 3].map(i => week + i).filter(w => ahead?.[w]);
  return (
    <Card>
      <H tone={tone}>{name}</H>
      <div style={{ fontSize: 12, color: MUTE, marginBottom: 8 }}>{meta}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontFamily: cond, fontWeight: 700, fontSize: 13, color: MUTE }}>Starters</div>
        <WeekLink week={week} onClick={onWeekClick} />
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

function ScheduleModal({ tone, title, myName, rows, currentWeek, empty, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 30, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: PAPER, borderRadius: "14px 14px 0 0", maxHeight: "80vh", overflowY: "auto", width: "100%", maxWidth: 640, padding: "16px 16px calc(16px + env(safe-area-inset-bottom))" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <H tone={tone}>{title}</H>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, color: MUTE, cursor: "pointer", padding: 4 }}>&times;</button>
        </div>
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
      </div>
    </div>
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
function LineupCard({ tone, title, rows, kick, now }) {
  if (!rows?.length) return null;
  const sorted = [...rows].map(r => ({ ...r, g: gameState(kick, r.team, now) })).sort((a, b) => (a.g.at?.getTime() || 9e15) - (b.g.at?.getTime() || 9e15));
  const callTone = c => /^sit|^bench|^out/i.test(c) ? OX : /^watch|^check|^if/i.test(c) ? AMBER : WIN;
  return (
    <Card style={{ marginBottom: 10 }}>
      <H tone={tone} style={{ marginBottom: 8 }}>{title}</H>
      {sorted.map((r, i) => (
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
      ))}
    </Card>
  );
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
  if (!rows?.length) return <Card><Empty>No matchup analysis yet. The scheduled task writes this each run.</Empty></Card>;
  const starters = rows.filter(r => r.slot !== "BN" && r.slot !== "IR");
  const groups = POS_ORDER.map(p => [p, starters.filter(r => r.pos === p)]).filter(([, g]) => g.length);
  const extra = starters.filter(r => !POS_ORDER.includes(r.pos));
  if (extra.length) groups.push(["FLEX", extra]);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {groups.map(([pos, g]) => (
        <Card key={pos}>
          <H tone={tone} style={{ marginBottom: 4 }}>{pos}</H>
          {g.map((r, i) => <MatchupRow key={i} r={r} />)}
        </Card>
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

// ---------- app ----------
function App() {
  const cfg = CONFIG;
  const [data, setData] = useState(null), [dataErr, setDataErr] = useState(""), [dataBusy, setDataBusy] = useState(false), [dataCached, setDataCached] = useState(false);
  const [lg, setLg] = useState("sleeper"), [view, setView] = useState("matchup");
  const [sl, setSl] = useState(null), [slErr, setSlErr] = useState(""), [slBusy, setSlBusy] = useState(false);
  const [kick, setKick] = useState(null), [ahead, setAhead] = useState(null), [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [fullSchedule, setFullSchedule] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
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
  const lineup = data?.lineup || {};
  const analysis = data?.analysis || {};

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
  const tabs = [["matchup", "Matchup"], ["team", "Team"], ["analysis", "Analysis"], ["league", "League"], ["brief", "Brief"], ["moves", "Moves"], ...(season.length ? [["season", "Season"]] : [])];
  const yahooEmpty = <Card><Empty>No Yahoo data yet. Drop roster + matchup screenshots in the "War room" Drive folder; the next scheduled run reads them.</Empty></Card>;

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
          ? <Matchup tone={INK} meName={cfg.sleeperTeamName} meRec={myRec} oppName={sl.oppUser?.metadata?.team_name || sl.oppUser?.display_name} oppRec={oppRec}
              mine={my.starters} theirs={opp.starters} myPts={sl.myMatch?.points ?? 0} oppPts={sl.oppMatch?.points ?? 0}
              myProj={sum(my.starters, "proj")} oppProj={sum(opp.starters, "proj")} sub={`Week ${sl.week}`} kick={kick} now={now}
              week={sl.week} onWeekClick={() => setScheduleOpen(true)} />
          : <Card><Empty>{slBusy ? "Loading your Sleeper matchup…" : "Sleeper didn't load."}</Empty></Card>)}
        {view === "matchup" && lg === "yahoo" && (yahoo
          ? <Matchup tone={OX} meName={cfg.yahooTeamName} meRec={yahoo.record} oppName={yahoo.opponent} oppRec={yahoo.oppRecord}
              mine={yahoo.starters} theirs={yahoo.opp} myPts={yahoo.myPts} oppPts={yahoo.oppPts}
              myProj={yahoo.myProj ?? sum(yahoo.starters, "proj")} oppProj={yahoo.oppProj ?? sum(yahoo.opp, "proj")}
              sub={yahoo.live ? `Wk ${yahoo.week} · live est.` : `Week ${yahoo.week}${yahoo.winProb ? " · " + yahoo.winProb : ""}`} kick={kick} now={now}
              week={yahoo.week} onWeekClick={() => setScheduleOpen(true)}
              action={<div style={{ fontSize: 12, color: MUTE }}>Roster, projections and injury tags from screenshots dated {yahoo.updatedAt}. Points during games are computed from Sleeper's live stat feed with Game of Throws scoring — they track Yahoo within stat corrections. Drop new Yahoo screenshots in the "War room" Drive folder to update the roster.</div>} />
          : yahooEmpty)}

        {view === "team" && lg === "sleeper" && (sl
          ? <Team tone={INK} name={cfg.sleeperTeamName} meta={`${myRec} · ${sl.league.settings.waiver_type === 2 ? `FAAB $${sl.standings.find(x => x.mine)?.faab} left` : "priority waivers"} · ${sl.league.scoring_settings?.rec >= 1 ? "PPR" : sl.league.scoring_settings?.rec >= 0.5 ? "half PPR" : "standard"}`}
              starters={my.starters} bench={my.bench} kick={kick} now={now} contingency={contingency} ahead={ahead} week={sl.week} onWeekClick={() => setScheduleOpen(true)} />
          : <Card><Empty>Sleeper not loaded.</Empty></Card>)}
        {view === "team" && lg === "yahoo" && (yahoo
          ? <Team tone={OX} name={cfg.yahooTeamName} meta={`${yahoo.record || ""} · half PPR · from screenshots ${yahoo.updatedAt}`} starters={yahoo.starters} bench={yahoo.bench} kick={kick} now={now} contingency={contingency} ahead={ahead} week={week} onWeekClick={() => setScheduleOpen(true)} />
          : yahooEmpty)}

        {view === "analysis" && lg === "sleeper" && <Analysis tone={INK} rows={analysis.sleeper} />}
        {view === "analysis" && lg === "yahoo" && (yahoo ? <Analysis tone={OX} rows={analysis.yahoo} /> : yahooEmpty)}

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
          <LineupCard tone={tone} title={lg === "sleeper" ? "Lineup — Gangstas Paradise" : "Lineup — Game of Throws"} rows={lineup[lg]} kick={kick} now={now} />
          <Card>
            {brief ? <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                <div style={{ fontSize: 12, color: MUTE }}>{brief.mode || "daily"} brief · {stamp(brief.at)}</div><CopyBtn text={brief.text} />
              </div>
              <Report text={brief.text} />
            </> : <Empty>No brief yet. The scheduled task writes one every morning at 7 AM and again Sunday 9 AM Pacific.</Empty>}
          </Card>
        </>}

        {view === "moves" && <div style={{ display: "grid", gap: 10 }}>
          <H tone={tone}>Waivers</H>
          <Section item={waivers} empty="Waiver plans are written on Tuesday and Wednesday runs." />
          <H tone={tone}>Trades</H>
          <Section item={trades} empty={`Trade ideas are written on Tuesday runs. To get a proposal evaluated, put a note named "trade.txt" in the Drive folder.`} />
        </div>}

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
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
