// ghosted_ dashboard: a small local web page with what ghosted_ did, served from 127.0.0.1 only.
// Started by /ghosted-stats; stops itself after 30 minutes without a visit. No dependencies.
// Usage: node dashboard.js <data dir>   (prints {"port", "token"} once it listens)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DATA = process.argv[2];
const TOKEN = crypto.randomBytes(12).toString('hex');
const IDLE_MS = 30 * 60 * 1000;

const jsonl = f => { try { return fs.readFileSync(path.join(DATA, f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
const json = f => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return {}; } };

function stats() {
  return {
    events: jsonl('events.jsonl').slice(-2000),
    judge: jsonl('judge-costs.jsonl').slice(-2000),
    archive: jsonl(path.join('archive', 'index.jsonl')).slice(-200).map(a => ({ ts: a.ts, task: a.task, tokens: a.tokens, cwd: a.cwd })),
    settings: json('settings.json'),
    now: new Date().toISOString(),
  };
}

let idle;
const touch = () => { clearTimeout(idle); idle = setTimeout(() => process.exit(0), IDLE_MS); };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.searchParams.get('t') !== TOKEN) { res.writeHead(403); res.end('ghosted_: open the link /ghosted-stats printed.'); return; }
  touch();
  const send = (type, body) => { res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
  if (url.pathname === '/api/stats') return send('application/json', JSON.stringify(stats()));
  if (url.pathname === '/api/recall') {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'ghosted.js'), 'recall', DATA], { input: url.searchParams.get('q') || '', encoding: 'utf8', timeout: 10000 });
    return send('text/plain; charset=utf-8', r.stdout || 'Nothing found.');
  }
  if (url.pathname === '/') return send('text/html; charset=utf-8', PAGE);
  res.writeHead(404); res.end();
});

function listen(port) {
  server.once('error', e => (e.code === 'EADDRINUSE' && port < 4790 ? listen(port + 1) : process.exit(1)));
  server.listen(port, '127.0.0.1', () => {
    const info = { port, token: TOKEN, pid: process.pid };
    fs.writeFileSync(path.join(DATA, 'dashboard.json'), JSON.stringify(info), { mode: 0o600 });
    process.stdout.write(JSON.stringify(info) + '\n');
    touch();
  });
}
listen(4747);

const PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ghosted_ · dashboard</title>
<style>
:root { --bg:#050505; --s1:#0b0b0b; --line:#1b1b1b; --line2:#2a2a2a; --hi:#fff; --fg:#e8e8e8; --dim:#8f8f8f; --faint:#555;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace; --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
* { box-sizing: border-box; } html { background: var(--bg); color: var(--fg); }
body { margin: 0; font: 14px/1.55 var(--sans); -webkit-font-smoothing: antialiased; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px 64px; }
header { display: flex; align-items: center; justify-content: space-between; height: 64px; border-bottom: 1px solid var(--line); margin-bottom: 28px; }
header b { font: 600 15px var(--mono); } header span { font: 12px var(--mono); color: var(--faint); }
h2 { font-size: 13px; font-weight: 500; color: var(--dim); margin: 0 0 14px; letter-spacing: .02em; }
.kpis { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid var(--line); border-radius: 14px; background: var(--s1); margin-bottom: 16px; }
.kpis > div { padding: 18px 20px; border-left: 1px solid var(--line); } .kpis > div:first-child { border-left: 0; }
.kpis span { display: block; font-size: 12px; color: var(--faint); } .kpis b { display: block; font-size: 28px; letter-spacing: -.04em; color: var(--hi); margin: 6px 0 2px; font-weight: 600; }
.kpis small { color: var(--faint); font-size: 12px; }
.grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 16px; align-items: start; }
.card { border: 1px solid var(--line); border-radius: 14px; background: var(--s1); padding: 20px; min-width: 0; }
svg { display: block; width: 100%; height: auto; }
.legend { display: flex; gap: 16px; font: 11.5px var(--mono); color: var(--dim); margin-bottom: 10px; }
.legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; font: 500 11px var(--mono); color: var(--faint); text-transform: uppercase; letter-spacing: .08em; padding: 8px 10px; border-bottom: 1px solid var(--line); }
td { padding: 10px; border-bottom: 1px solid #131313; color: var(--dim); vertical-align: top; } td:first-child { white-space: nowrap; }
td.n { text-align: right; font-family: var(--mono); color: var(--hi); white-space: nowrap; }
.tag { font: 500 11px var(--mono); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line2); color: var(--dim); white-space: nowrap; }
.tag.new { background: var(--hi); color: #000; border-color: var(--hi); }
.est { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--dim); margin-top: 12px; }
.est input { width: 70px; background: #0f0f0f; border: 1px solid var(--line2); color: var(--hi); border-radius: 7px; padding: 5px 8px; font: 12.5px var(--mono); }
.search { display: flex; gap: 8px; margin-bottom: 12px; }
.search input { flex: 1; background: #0f0f0f; border: 1px solid var(--line2); color: var(--hi); border-radius: 9px; padding: 9px 12px; font: 13px var(--mono); outline: 0; }
.search button { background: var(--hi); color: #000; border: 0; border-radius: 9px; padding: 0 14px; font-weight: 600; cursor: pointer; }
pre { white-space: pre-wrap; font: 12px/1.6 var(--mono); color: var(--dim); margin: 0; max-height: 320px; overflow: auto; }
.empty { color: var(--faint); padding: 18px 0; }
@media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, 1fr); } .grid { grid-template-columns: 1fr; } }
</style></head><body><div class="wrap">
<header><b>ghosted_</b><span id="upd">loading…</span></header>
<div class="kpis" id="kpis"></div>
<div class="grid">
  <div class="card"><h2>Activity, last 14 days</h2><div class="legend"><span><i style="background:#fff"></i>task switches</span><span><i style="background:#666"></i>kept (same task)</span><span><i style="background:#2f2f2f"></i>warm pings</span></div><div id="days"></div></div>
  <div class="card"><h2>How prompts were decided</h2><div id="donut"></div></div>
</div>
<div class="grid">
  <div class="card"><h2>Context dropped at each task switch</h2><div id="drops"></div>
    <div class="est">Estimated saving: <b id="saved" style="color:#fff">$0</b> at <input id="price" type="number" step="0.05" value="0.20"> $ per million cached tokens, <input id="turns" type="number" step="1" value="5"> turns per task</div></div>
  <div class="card"><h2>Settings</h2><div id="settings"></div></div>
</div>
<div class="card" style="margin-bottom:16px"><h2>Recent</h2><div id="recent"></div></div>
<div class="card"><h2>Archive</h2><form class="search" id="rf"><input id="rq" placeholder="search old conversations, e.g. auth expiry"><button>Recall</button></form><pre id="rout"></pre><div id="arch"></div></div>
</div>
<script>
const T = new URLSearchParams(location.search).get('t');
const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const k = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n || 0);
const ago = ts => { const s = (Date.now() - new Date(ts)) / 1000; return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + 'm ago' : s < 129600 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago'; };
let D;
function render() {
  const ev = D.events, sw = ev.filter(e => e.kind === 'switch'), kept = ev.filter(e => e.kind === 'kept'), warm = ev.filter(e => e.kind === 'warm');
  const dropped = sw.reduce((t, e) => t + (e.tokens || 0), 0), judgeUsd = D.judge.reduce((t, c) => t + (c.usd || 0), 0);
  const price = +$('#price').value || 0, turns = +$('#turns').value || 0, saved = dropped * turns * price / 1e6;
  $('#saved').textContent = '$' + saved.toFixed(2);
  $('#kpis').innerHTML = [
    ['Task switches', sw.length, k(dropped) + ' tokens dropped'],
    ['Kept', kept.length, 'prompts that stayed in context'],
    ['Warm pings', warm.length, k(warm.reduce((t, e) => t + (e.tokens || 0), 0)) + ' read from cache'],
    ['Judge spend', '$' + judgeUsd.toFixed(3), D.judge.length + ' calls'],
    ['Est. saved', '$' + saved.toFixed(2), 'see the estimate below'],
  ].map(([a, b, c]) => '<div><span>' + a + '</span><b>' + b + '</b><small>' + c + '</small></div>').join('');
  // activity per day
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return d; });
  const per = days.map(d => { const n = new Date(d); n.setDate(n.getDate() + 1); const inDay = e => new Date(e.ts) >= d && new Date(e.ts) < n;
    return [sw.filter(inDay).length, kept.filter(inDay).length, warm.filter(inDay).length]; });
  const max = Math.max(1, ...per.map(p => p[0] + p[1] + p[2])), W = 700, H = 180, bw = W / 14;
  $('#days').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + (H + 22) + '">' + per.map((p, i) => {
    let y = H, out = '';
    [['#fff', p[0]], ['#666', p[1]], ['#2f2f2f', p[2]]].forEach(([c, v]) => { const h = v / max * (H - 10); y -= h; if (v) out += '<rect x="' + (i * bw + 6) + '" y="' + y + '" width="' + (bw - 12) + '" height="' + h + '" rx="3" fill="' + c + '"><title>' + v + '</title></rect>'; });
    return out + '<text x="' + (i * bw + bw / 2) + '" y="' + (H + 16) + '" text-anchor="middle" font-size="10" fill="#555" font-family="monospace">' + (days[i].getDate()) + '</text>';
  }).join('') + '<line x1="0" x2="' + W + '" y1="' + H + '" y2="' + H + '" stroke="#222"/></svg>';
  // decisions donut
  const parts = [['new task', sw.length, '#fff'], ['judge: same', kept.filter(e => e.why === 'judge').length, '#888'], ['follow-up, no judge', kept.filter(e => e.why === 'follow-up').length, '#444'], ['judge error, kept', kept.filter(e => e.why === 'judge-error').length, '#2a2a2a']];
  const total = parts.reduce((t, p) => t + p[1], 0);
  let a0 = -Math.PI / 2, arcs = '';
  if (total) parts.forEach(([, v, c]) => { if (!v) return; const a1 = a0 + v / total * Math.PI * 2 - 0.0001, big = a1 - a0 > Math.PI ? 1 : 0;
    arcs += '<path d="M' + (100 + 80 * Math.cos(a0)) + ',' + (100 + 80 * Math.sin(a0)) + ' A80,80 0 ' + big + ' 1 ' + (100 + 80 * Math.cos(a1)) + ',' + (100 + 80 * Math.sin(a1)) + '" fill="none" stroke="' + c + '" stroke-width="22"/>'; a0 = a1 + 0.0001; });
  $('#donut').innerHTML = total ? '<svg viewBox="0 0 200 200" style="max-width:200px;margin:0 auto 14px">' + arcs + '<text x="100" y="98" text-anchor="middle" fill="#fff" font-size="28" font-weight="600">' + total + '</text><text x="100" y="118" text-anchor="middle" fill="#666" font-size="11">prompts</text></svg>'
    + parts.map(p => '<div style="display:flex;justify-content:space-between;padding:4px 0;color:#8f8f8f"><span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:8px;background:' + p[2] + '"></i>' + p[0] + '</span><b style="color:#fff;font-weight:500">' + p[1] + '</b></div>').join('')
    : '<p class="empty">No prompts judged yet. They show up once a session is past the judge threshold (20k tokens by default).</p>';
  // drops
  const last = sw.slice(-24), dm = Math.max(1, ...last.map(e => e.tokens || 0));
  $('#drops').innerHTML = last.length ? '<svg viewBox="0 0 700 150">' + last.map((e, i) => { const h = (e.tokens || 0) / dm * 120, w = 700 / Math.max(last.length, 8);
    return '<rect x="' + (i * w + 4) + '" y="' + (130 - h) + '" width="' + (w - 8) + '" height="' + h + '" rx="3" fill="#fff"><title>' + esc(e.old || 'earlier task') + ' → ' + esc(e.focus || '') + ': ' + k(e.tokens) + '</title></rect>'; }).join('') + '<line x1="0" x2="700" y1="130" y2="130" stroke="#222"/></svg>'
    : '<p class="empty">No task switches yet.</p>';
  // settings
  const s = D.settings;
  $('#settings').innerHTML = '<table>' + [['Terse', s.terse || 'auto'], ['Keep warm', s.keep_warm || '1h (default)'], ['Paused', s.paused ? 'yes' : 'no']]
    .map(([a, b]) => '<tr><td>' + a + '</td><td class="n">' + esc(b) + '</td></tr>').join('') + '</table><p style="color:#555;font-size:12px;margin:12px 0 0">Change with /ghosted terse, /ghosted warm, /ghosted-off</p>';
  // recent
  const rows = ev.slice(-30).reverse();
  $('#recent').innerHTML = rows.length ? '<table><thead><tr><th>When</th><th>Event</th><th>Detail</th><th style="text-align:right">Tokens</th></tr></thead><tbody>' + rows.map(e => {
    const tag = e.kind === 'switch' ? '<span class="tag new">new task</span>' : '<span class="tag">' + esc(e.kind) + '</span>';
    const det = e.kind === 'switch' ? esc(e.old || 'earlier task') + ' → ' + esc(e.focus || '') + (e.carry ? ' · ' + e.carry + ' facts carried' : '')
      : e.kind === 'kept' ? esc(e.prompt || '') + ' · ' + esc(e.why || '') : e.kind === 'warm' ? 'cache kept warm' + (e.write != null ? ' · ' + k(e.write) + ' written' : '')
      : e.kind === 'warm-miss' ? 'ping missed the cache; warming stopped for that session' : e.kind === 'midrun' ? 'compacted mid-run' : '';
    const n = e.kind === 'switch' ? '−' + k(e.tokens) : e.kind === 'warm' ? k(e.tokens) + ' read' : e.tokens ? k(e.tokens) : '';
    return '<tr><td>' + ago(e.ts) + '</td><td>' + tag + '</td><td>' + det + '</td><td class="n">' + n + '</td></tr>'; }).join('') + '</tbody></table>'
    : '<p class="empty">Nothing yet. Keep working; ghosted_ logs here as it acts.</p>';
  $('#arch').innerHTML = D.archive.length ? '<table><tbody>' + D.archive.slice().reverse().slice(0, 12).map(a => '<tr><td>' + ago(a.ts) + '</td><td>' + esc(a.task) + '</td><td class="n">' + (a.tokens ? k(a.tokens) : '') + '</td></tr>').join('') + '</tbody></table>' : '';
  $('#upd').textContent = 'live · updated ' + new Date().toLocaleTimeString();
}
async function load() { try { D = await (await fetch('/api/stats?t=' + T)).json(); render(); } catch { $('#upd').textContent = 'dashboard stopped · run /ghosted-stats again'; } }
$('#price').oninput = $('#turns').oninput = () => D && render();
$('#rf').onsubmit = async e => { e.preventDefault(); $('#rout').textContent = 'searching…'; $('#rout').textContent = await (await fetch('/api/recall?t=' + T + '&q=' + encodeURIComponent($('#rq').value))).text(); };
load(); setInterval(load, 5000);
</script></body></html>`;
