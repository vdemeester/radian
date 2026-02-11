/**
 * Self-contained HTML dashboard generator.
 * Produces a single-file dashboard with inline CSS, SVG charts, and
 * embedded JSON data for client-side period switching.
 */

import type { AggregatedStats, SessionStats, PeriodName } from "../types.js";
import { aggregate } from "../aggregator.js";
import { filterSessions } from "../filters.js";
import { getBucketSize, buildTimeSeries } from "../trends.js";
import { splitModelKey } from "../utils.js";
import { svgBarChart, svgLineChart, svgDonutChart, svgHeatmap, escapeHtml } from "./svg.js";
import { classifyTools } from "./table.js";

// ═══════════════════════════════════════
// Dashboard data structure
// ═══════════════════════════════════════

interface DashboardPeriodData {
  summary: {
    sessions: number;
    messages: number;
    toolCalls: number;
    tokens: number;
    cost: number;
    avgSessionMessages: number;
    avgSessionTokens: number;
  };
  tools: { label: string; value: number; errors: number; sessPercent: number }[];
  models: { label: string; provider: string; calls: number; tokens: number; cost: number; color: string }[];
  projects: { label: string; sessions: number; messages: number }[];
  trends: { label: string; value: number }[];
  period: { label: string };
}

interface DashboardData {
  periods: Record<string, DashboardPeriodData>;
  heatmap: { date: string; value: number }[];
  generatedAt: string;
  hasCost: boolean;
}

const CHART_COLORS = [
  "#6366f1", "#22c55e", "#eab308", "#ef4444", "#3b82f6",
  "#f97316", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b",
];

const PERIOD_NAMES: PeriodName[] = ["today", "week", "month", "quarter", "year", "all"];

// ═══════════════════════════════════════
// Build dashboard data
// ═══════════════════════════════════════

export function buildDashboardData(sessions: SessionStats[]): DashboardData {
  const periods: Record<string, DashboardPeriodData> = {};

  for (const periodName of PERIOD_NAMES) {
    const filtered = filterSessions(sessions, { period: periodName });
    const stats = aggregate(filtered, { period: periodName });
    const bucketSize = getBucketSize(periodName);
    const trendSeries = buildTimeSeries(filtered, "tokens", bucketSize);

    const { extension } = classifyTools(stats.tools);

    // Session denominator for extension tools
    const extSessionIds = new Set<string>();
    for (const tool of extension) {
      for (const id of tool.sessionIds) extSessionIds.add(id);
    }
    const extSessions = extSessionIds.size || stats.totalSessions;

    periods[periodName] = {
      summary: {
        sessions: stats.totalSessions,
        messages: stats.totalMessages,
        toolCalls: stats.totalToolCalls,
        tokens: stats.totalTokens.total,
        cost: stats.totalCost,
        avgSessionMessages: stats.totalSessions > 0 ? Math.round(stats.totalMessages / stats.totalSessions) : 0,
        avgSessionTokens: stats.totalSessions > 0 ? Math.round(stats.totalTokens.total / stats.totalSessions) : 0,
      },
      tools: extension.map(t => ({
        label: t.name,
        value: t.calls,
        errors: t.errors,
        sessPercent: extSessions > 0 ? (t.sessionIds.size / extSessions) * 100 : 0,
      })),
      models: [...stats.models.entries()].map(([key, m], i) => {
        const [model, provider] = splitModelKey(key);
        return {
          label: model,
          provider,
          calls: m.calls,
          tokens: m.tokens.total,
          cost: m.cost,
          color: CHART_COLORS[i % CHART_COLORS.length],
        };
      }),
      projects: [...stats.projects.entries()]
        .sort(([, a], [, b]) => b.sessions - a.sessions)
        .slice(0, 15)
        .map(([name, p]) => ({ label: name, sessions: p.sessions, messages: p.messages })),
      trends: trendSeries.map(p => ({ label: p.label, value: p.value })),
      period: { label: stats.period.label },
    };
  }

  // Heatmap: sessions per day across all time
  const dayMap = new Map<string, number>();
  for (const s of sessions) {
    const key = s.startTime.toISOString().slice(0, 10);
    dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
  }
  const heatmap = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));

  const hasCost = sessions.some(s => s.cost > 0);

  return {
    periods,
    heatmap,
    generatedAt: new Date().toISOString(),
    hasCost,
  };
}

// ═══════════════════════════════════════
// Generate HTML
// ═══════════════════════════════════════

export function generateHtml(sessions: SessionStats[], defaultPeriod: PeriodName = "week"): string {
  const data = buildDashboardData(sessions);
  const pd = data.periods[defaultPeriod] ?? data.periods["all"];

  // Pre-render SVG charts for the default period
  const trendChart = svgLineChart({
    points: pd.trends,
    width: 600,
    height: 200,
    fill: true,
  });

  const toolChart = svgBarChart({
    items: pd.tools.slice(0, 12).map((t, i) => ({
      label: t.label,
      value: t.value,
      color: CHART_COLORS[i % CHART_COLORS.length],
    })),
    width: 600,
    barHeight: 18,
  });

  const donutChart = svgDonutChart({
    segments: pd.models.map(m => ({
      label: m.label,
      value: m.tokens,
      color: m.color,
    })),
    size: 180,
    centerLabel: fmtNum(pd.summary.tokens),
    centerSub: "tokens",
  });

  const projectChart = svgBarChart({
    items: pd.projects.slice(0, 10).map((p, i) => ({
      label: p.label,
      value: p.sessions,
      color: CHART_COLORS[i % CHART_COLORS.length],
    })),
    width: 600,
    barHeight: 18,
  });

  const heatmapChart = svgHeatmap({
    days: data.heatmap.map(d => ({ date: new Date(d.date), value: d.value })),
    cellSize: 12,
    gap: 2,
  });

  // Cost card (conditional)
  const costCard = data.hasCost
    ? `<div class="card">
        <div class="card-label">Cost</div>
        <div class="card-value">$${pd.summary.cost.toFixed(2)}</div>
        <div class="card-sub">$${pd.summary.sessions > 0 ? (pd.summary.cost / pd.summary.sessions).toFixed(2) : '0.00'} avg/session</div>
      </div>`
    : "";

  // Models table
  const modelsTable = pd.models.map(m => `
    <tr>
      <td><span class="color-dot" style="background:${m.color}"></span></td>
      <td>${escapeHtml(m.label)}</td>
      <td class="dim">${escapeHtml(m.provider)}</td>
      <td class="num">${fmtNum(m.calls)}</td>
      <td class="num">${fmtNum(m.tokens)}</td>
      ${data.hasCost ? `<td class="num">$${m.cost.toFixed(2)}</td>` : ''}
    </tr>`).join("\n");

  // Tools table
  const toolsTable = pd.tools.slice(0, 15).map(t => {
    const barW = pd.tools[0]?.value > 0 ? Math.max(2, (t.value / pd.tools[0].value) * 100) : 0;
    const errClass = t.errors > 0 ? ' style="color:var(--red)"' : ' class="dim"';
    return `
    <tr>
      <td>${escapeHtml(t.label)}</td>
      <td class="bar-cell"><span class="inline-bar" style="width:${barW}%"></span></td>
      <td class="num">${fmtNum(t.value)}</td>
      <td class="num"${errClass}>${t.errors}</td>
      <td class="num">${t.sessPercent.toFixed(1)}%</td>
    </tr>`;
  }).join("\n");

  // Serialize data for client-side switching (strip large nested objects)
  const clientData = JSON.stringify(data);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>radian — pi session analytics</title>
<style>
${CSS}
</style>
</head>
<body>

<header>
  <div class="header-top">
    <h1>📐 radian</h1>
    <select id="period-select" onchange="switchPeriod(this.value)">
      ${PERIOD_NAMES.map(p => `<option value="${p}"${p === defaultPeriod ? ' selected' : ''}>${periodLabel(p)}</option>`).join("\n      ")}
    </select>
  </div>
  <p class="subtitle" id="subtitle">${escapeHtml(pd.period.label)} · ${pd.summary.sessions} sessions · Generated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
</header>

<!-- Summary Cards -->
<div class="cards" id="cards">
  <div class="card">
    <div class="card-label">Sessions</div>
    <div class="card-value" data-field="sessions">${fmtNum(pd.summary.sessions)}</div>
    <div class="card-sub" data-field="avgMessages">${pd.summary.avgSessionMessages} avg msg/session</div>
  </div>
  <div class="card">
    <div class="card-label">Messages</div>
    <div class="card-value" data-field="messages">${fmtNum(pd.summary.messages)}</div>
  </div>
  <div class="card">
    <div class="card-label">Tool Calls</div>
    <div class="card-value" data-field="toolCalls">${fmtNum(pd.summary.toolCalls)}</div>
  </div>
  <div class="card">
    <div class="card-label">Tokens</div>
    <div class="card-value" data-field="tokens">${fmtNum(pd.summary.tokens)}</div>
    <div class="card-sub" data-field="avgTokens">${fmtNum(pd.summary.avgSessionTokens)} avg/session</div>
  </div>
  ${costCard}
</div>

<!-- Token Trend -->
<div class="section">
  <h2>Token Usage</h2>
  <div class="chart-container" id="trend-chart">${trendChart}</div>
</div>

<!-- Tools -->
<div class="section">
  <h2>Extension Tools</h2>
  <div class="chart-container" id="tool-chart">${toolChart}</div>
  <table id="tool-table" data-sortable>
    <thead>
      <tr>
        <th onclick="sortTable(this,0,'str')">Tool <span class="sort-indicator"></span></th>
        <th class="bar-cell">Usage</th>
        <th class="num" onclick="sortTable(this,2,'num')">Calls <span class="sort-indicator"></span></th>
        <th class="num" onclick="sortTable(this,3,'num')">Errors <span class="sort-indicator"></span></th>
        <th class="num" onclick="sortTable(this,4,'num')">Sess% <span class="sort-indicator"></span></th>
      </tr>
    </thead>
    <tbody>${toolsTable}</tbody>
  </table>
</div>

<!-- Models -->
<div class="section">
  <h2>Models</h2>
  <div class="models-layout">
    <div id="donut-chart">${donutChart}</div>
    <div class="models-table-wrap">
      <table id="model-table" data-sortable>
        <thead>
          <tr>
            <th></th>
            <th onclick="sortTable(this,1,'str')">Model <span class="sort-indicator"></span></th>
            <th onclick="sortTable(this,2,'str')">Provider <span class="sort-indicator"></span></th>
            <th class="num" onclick="sortTable(this,3,'num')">Calls <span class="sort-indicator"></span></th>
            <th class="num" onclick="sortTable(this,4,'num')">Tokens <span class="sort-indicator"></span></th>
            ${data.hasCost ? '<th class="num" onclick="sortTable(this,5,\'num\')">Cost <span class="sort-indicator"></span></th>' : ''}
          </tr>
        </thead>
        <tbody>${modelsTable}</tbody>
      </table>
    </div>
  </div>
</div>

<!-- Projects -->
<div class="section">
  <h2>Projects</h2>
  <div class="chart-container" id="project-chart">${projectChart}</div>
</div>

<!-- Session Activity Heatmap -->
<div class="section">
  <h2>Session Activity</h2>
  <div class="chart-container" id="heatmap-chart">${heatmapChart}</div>
</div>

<footer>
  Generated by radian · <a href="https://github.com/vdemeester/radian">github.com/vdemeester/radian</a>
</footer>

<script>
const RADIAN_DATA = ${clientData};

function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('en-US');
}

const COLORS = ['#6366f1','#22c55e','#eab308','#ef4444','#3b82f6','#f97316','#8b5cf6','#ec4899','#14b8a6','#64748b'];
const hasCost = RADIAN_DATA.hasCost;

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function niceStep(max, ticks) {
  const r = max / ticks, m = Math.pow(10, Math.floor(Math.log10(r))), res = r / m;
  return (res <= 1.5 ? 1 : res <= 3 ? 2 : res <= 7 ? 5 : 10) * m;
}

function renderLine(el, points) {
  if (!points.length) { el.innerHTML = '<p style="color:var(--fg2)">No data</p>'; return; }
  const W=600, H=200, pad={t:25,r:20,b:30,l:55};
  const cW=W-pad.l-pad.r, cH=H-pad.t-pad.b;
  const maxV = Math.max(...points.map(p=>p.value),1);
  const step = niceStep(maxV, 4), yMax = Math.ceil(maxV/step)*step;
  const px = (i) => points.length===1 ? pad.l+cW/2 : pad.l+(i/(points.length-1))*cW;
  const py = (v) => pad.t+cH-(v/yMax)*cH;
  let s = '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'">';
  for (let v=0;v<=yMax;v+=step) {
    s+='<line x1="'+pad.l+'" y1="'+py(v)+'" x2="'+(W-pad.r)+'" y2="'+py(v)+'" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="'+(v===0?'0':'4')+'"/>';
    s+='<text x="'+(pad.l-8)+'" y="'+(py(v)+4)+'" text-anchor="end" fill="var(--fg2)" font-size="10">'+fmtNum(v)+'</text>';
  }
  if (points.length>1) {
    const pts = points.map((p,i)=>px(i)+','+py(p.value)).join(' ');
    s+='<polygon points="'+pts+' '+px(points.length-1)+','+py(0)+' '+px(0)+','+py(0)+'" fill="#6366f1" opacity="0.1"/>';
    s+='<polyline points="'+pts+'" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linejoin="round"/>';
  }
  points.forEach((p,i)=>{
    s+='<circle cx="'+px(i)+'" cy="'+py(p.value)+'" r="4" fill="#6366f1"/>';
    s+='<text x="'+px(i)+'" y="'+(py(0)+18)+'" text-anchor="middle" fill="var(--fg2)" font-size="10">'+esc(p.label)+'</text>';
    s+='<text x="'+px(i)+'" y="'+(py(p.value)-8)+'" text-anchor="middle" fill="var(--fg)" font-size="10" font-weight="600">'+fmtNum(p.value)+'</text>';
  });
  el.innerHTML = s + '</svg>';
}

function renderBars(el, items) {
  if (!items.length) { el.innerHTML = '<p style="color:var(--fg2)">No data</p>'; return; }
  const W=600, bH=18, gap=6, lW=130, bW=W-lW-80;
  const maxV = Math.max(...items.map(i=>i.value));
  const H = items.length*(bH+gap)+10;
  let s = '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'">';
  items.forEach((item,i)=>{
    const y=i*(bH+gap)+5, w=maxV>0?Math.max(2,(item.value/maxV)*bW):0;
    const c = item.color||COLORS[i%COLORS.length];
    s+='<text x="'+(lW-8)+'" y="'+(y+bH*0.72)+'" text-anchor="end" fill="var(--fg)" font-size="12">'+esc(item.label)+'</text>';
    s+='<rect x="'+lW+'" y="'+y+'" width="'+w+'" height="'+bH+'" rx="3" fill="'+c+'" opacity="0.8"/>';
    s+='<text x="'+(lW+w+8)+'" y="'+(y+bH*0.72)+'" fill="var(--fg2)" font-size="11">'+fmtNum(item.value)+'</text>';
  });
  el.innerHTML = s + '</svg>';
}

function renderDonut(el, segments, centerLabel, centerSub) {
  if (!segments.length) { el.innerHTML = '<p style="color:var(--fg2)">No data</p>'; return; }
  const sz=180, cx=90, cy=90, r=74, sw=24;
  const circ = 2*Math.PI*r, total = segments.reduce((s,x)=>s+x.value,0);
  let s = '<svg viewBox="0 0 '+sz+' '+sz+'" width="'+sz+'" height="'+sz+'">';
  let off=0;
  segments.forEach(seg=>{
    const len = total>0?(seg.value/total)*circ:0;
    s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+seg.color+'" stroke-width="'+sw+'" stroke-dasharray="'+len+' '+(circ-len)+'" stroke-dashoffset="'+(-off)+'" transform="rotate(-90 '+cx+' '+cy+')"/>';
    off+=len;
  });
  if(centerLabel) s+='<text x="'+cx+'" y="'+(cy-2)+'" text-anchor="middle" fill="var(--fg)" font-size="14" font-weight="700">'+esc(centerLabel)+'</text>';
  if(centerSub) s+='<text x="'+cx+'" y="'+(cy+14)+'" text-anchor="middle" fill="var(--fg2)" font-size="10">'+esc(centerSub)+'</text>';
  el.innerHTML = s + '</svg>';
}

function renderToolTable(el, tools) {
  let rows = '';
  const maxV = tools.length > 0 ? tools[0].value : 0;
  tools.slice(0,15).forEach(t => {
    const barW = maxV > 0 ? Math.max(2, (t.value/maxV)*100) : 0;
    const errStyle = t.errors > 0 ? ' style="color:var(--red)"' : ' class="dim"';
    rows += '<tr><td>'+esc(t.label)+'</td><td class="bar-cell"><span class="inline-bar" style="width:'+barW+'%"></span></td><td class="num">'+fmtNum(t.value)+'</td><td class="num"'+errStyle+'>'+t.errors+'</td><td class="num">'+t.sessPercent.toFixed(1)+'%</td></tr>';
  });
  el.querySelector('tbody').innerHTML = rows;
  // Reset sort indicators
  el.querySelectorAll('.sort-indicator').forEach(s => { s.className = 'sort-indicator'; });
  el.querySelectorAll('th[data-sort-dir]').forEach(th => { delete th.dataset.sortDir; });
}

function renderModelTable(el, models) {
  let rows = '';
  models.forEach(m => {
    rows += '<tr><td><span class="color-dot" style="background:'+m.color+'"></span></td><td>'+esc(m.label)+'</td><td class="dim">'+esc(m.provider)+'</td><td class="num">'+fmtNum(m.calls)+'</td><td class="num">'+fmtNum(m.tokens)+'</td>';
    if (hasCost) rows += '<td class="num">$'+m.cost.toFixed(2)+'</td>';
    rows += '</tr>';
  });
  el.querySelector('tbody').innerHTML = rows;
  el.querySelectorAll('.sort-indicator').forEach(s => { s.className = 'sort-indicator'; });
  el.querySelectorAll('th[data-sort-dir]').forEach(th => { delete th.dataset.sortDir; });
}

function sortTable(th, colIdx, type) {
  const table = th.closest('table');
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const indicator = th.querySelector('.sort-indicator');

  // Clear all indicators in this table
  table.querySelectorAll('.sort-indicator').forEach(s => { s.className = 'sort-indicator'; });

  // Toggle direction
  const asc = th.dataset.sortDir !== 'asc';
  th.dataset.sortDir = asc ? 'asc' : 'desc';
  indicator.className = 'sort-indicator ' + (asc ? 'asc' : 'desc');

  rows.sort((a, b) => {
    let va = a.cells[colIdx]?.textContent?.trim() || '';
    let vb = b.cells[colIdx]?.textContent?.trim() || '';
    if (type === 'num') {
      // Parse numbers: strip $, %, commas, M/K suffixes
      const pn = (s) => {
        s = s.replace(/[$,%]/g, '').replace(/,/g, '');
        if (s.endsWith('M')) return parseFloat(s) * 1e6;
        if (s.endsWith('K')) return parseFloat(s) * 1e3;
        return parseFloat(s) || 0;
      };
      return asc ? pn(va) - pn(vb) : pn(vb) - pn(va);
    }
    return asc ? va.localeCompare(vb) : vb.localeCompare(va);
  });
  rows.forEach(r => tbody.appendChild(r));
}

function switchPeriod(period) {
  const pd = RADIAN_DATA.periods[period];
  if (!pd) return;

  // Subtitle
  document.getElementById('subtitle').textContent =
    pd.period.label + ' · ' + pd.summary.sessions + ' sessions';

  // Cards
  const cards = document.getElementById('cards');
  const u = (f, v) => { const el = cards.querySelector('[data-field="'+f+'"]'); if(el) el.textContent = v; };
  u('sessions', fmtNum(pd.summary.sessions));
  u('messages', fmtNum(pd.summary.messages));
  u('toolCalls', fmtNum(pd.summary.toolCalls));
  u('tokens', fmtNum(pd.summary.tokens));
  u('avgMessages', pd.summary.avgSessionMessages + ' avg msg/session');
  u('avgTokens', fmtNum(pd.summary.avgSessionTokens) + ' avg/session');
  const costEl = cards.querySelector('[data-field="cost"]');
  if (costEl) costEl.textContent = '$' + pd.summary.cost.toFixed(2);
  const costAvg = cards.querySelector('[data-field="costAvg"]');
  if (costAvg) costAvg.textContent = '$' + (pd.summary.sessions > 0 ? (pd.summary.cost / pd.summary.sessions).toFixed(2) : '0.00') + ' avg/session';

  // Charts
  renderLine(document.getElementById('trend-chart'), pd.trends);
  renderBars(document.getElementById('tool-chart'), pd.tools.slice(0,12).map((t,i) => ({label:t.label,value:t.value,color:COLORS[i%COLORS.length]})));
  renderDonut(document.getElementById('donut-chart'), pd.models.map(m => ({label:m.label,value:m.tokens,color:m.color})), fmtNum(pd.summary.tokens), 'tokens');
  renderBars(document.getElementById('project-chart'), pd.projects.slice(0,10).map((p,i) => ({label:p.label,value:p.sessions,color:COLORS[i%COLORS.length]})));

  // Tables
  renderToolTable(document.getElementById('tool-table'), pd.tools);
  renderModelTable(document.getElementById('model-table'), pd.models);
}
</script>

</body>
</html>`;
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function periodLabel(p: PeriodName): string {
  switch (p) {
    case "today": return "Today";
    case "week": return "This Week";
    case "month": return "This Month";
    case "quarter": return "This Quarter";
    case "year": return "This Year";
    case "all": return "All Time";
  }
}

// ═══════════════════════════════════════
// Inline CSS
// ═══════════════════════════════════════

const CSS = `
:root {
  --bg: #fafafa; --bg2: #fff; --fg: #1a1a2e; --fg2: #555;
  --border: #e0e0e0; --accent: #6366f1; --accent2: #818cf8;
  --green: #22c55e; --yellow: #eab308; --red: #ef4444; --blue: #3b82f6;
  --card-shadow: 0 1px 3px rgba(0,0,0,0.08);
  --radius: 8px;
  --heat-0: #ebedf0; --heat-1: #6366f133; --heat-2: #6366f166; --heat-3: #6366f199; --heat-4: #6366f1;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f1a; --bg2: #1a1a2e; --fg: #e4e4e7; --fg2: #a1a1aa;
    --border: #2a2a3e; --accent: #818cf8; --accent2: #6366f1;
    --card-shadow: 0 1px 3px rgba(0,0,0,0.3);
    --heat-0: #1e1e32; --heat-1: #6366f133; --heat-2: #6366f166; --heat-3: #6366f199; --heat-4: #818cf8;
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: var(--bg); color: var(--fg); line-height: 1.6; padding: 2rem; max-width: 1100px; margin: 0 auto; }
header { margin-bottom: 2rem; }
.header-top { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.25rem; }
h1 { font-size: 1.5rem; font-weight: 600; }
h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; }
.subtitle { color: var(--fg2); font-size: 0.875rem; }
select { font-size: 0.875rem; padding: 0.35rem 0.75rem; border: 1px solid var(--border);
  border-radius: var(--radius); background: var(--bg2); color: var(--fg); cursor: pointer; }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
.card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 1.25rem; box-shadow: var(--card-shadow); }
.card-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--fg2); }
.card-value { font-size: 1.75rem; font-weight: 700; color: var(--accent); }
.card-sub { font-size: 0.75rem; color: var(--fg2); }

.section { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: var(--card-shadow); }
.chart-container { overflow-x: auto; }

table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 1rem; }
th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 2px solid var(--border);
  color: var(--fg2); font-weight: 500; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
tr:last-child td { border-bottom: none; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.dim { color: var(--fg2); }
.bar-cell { width: 120px; }
.inline-bar { height: 6px; border-radius: 3px; background: var(--accent); display: inline-block; vertical-align: middle; }
.color-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
.models-layout { display: flex; gap: 2rem; align-items: start; flex-wrap: wrap; }
.models-table-wrap { flex: 1; min-width: 300px; }

footer { text-align: center; color: var(--fg2); font-size: 0.75rem; margin-top: 2rem; padding: 1rem 0; }
footer a { color: var(--accent); }

th[onclick] { cursor: pointer; user-select: none; }
th[onclick]:hover { color: var(--accent); }
.sort-indicator { font-size: 0.65rem; opacity: 0.4; }
.sort-indicator.asc::after { content: ' ▲'; opacity: 1; }
.sort-indicator.desc::after { content: ' ▼'; opacity: 1; }

svg text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }

@media print { body { padding: 1rem; } .section { break-inside: avoid; } select { display: none; } }
@media (max-width: 640px) { body { padding: 1rem; } .models-layout { flex-direction: column; } }
`;
