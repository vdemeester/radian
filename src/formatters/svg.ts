/**
 * SVG chart generators.
 * Pure functions that return SVG markup strings.
 * No external dependencies — all charts are hand-rolled inline SVG.
 */

// Chart color palette
const COLORS = [
  "#6366f1", "#22c55e", "#eab308", "#ef4444", "#3b82f6",
  "#f97316", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b",
];

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

// ═══════════════════════════════════════
// Horizontal Bar Chart
// ═══════════════════════════════════════

export interface BarChartOptions {
  items: { label: string; value: number; color?: string }[];
  width: number;
  barHeight: number;
  labelWidth?: number;
}

export function svgBarChart(opts: BarChartOptions): string {
  const { items, width, barHeight } = opts;
  if (items.length === 0) {
    return `<svg viewBox="0 0 ${width} 40" width="100%" height="40">
      <text x="${width / 2}" y="24" text-anchor="middle" fill="var(--fg2)" font-size="12">No data</text>
    </svg>`;
  }

  const labelWidth = opts.labelWidth ?? Math.min(150, Math.max(80, ...items.map(i => i.label.length * 7.5)));
  const barAreaWidth = width - labelWidth - 80; // space for value label
  const gap = 6;
  const maxValue = Math.max(...items.map(i => i.value));
  const totalHeight = items.length * (barHeight + gap) + 10;

  let rects = "";
  items.forEach((item, i) => {
    const y = i * (barHeight + gap) + 5;
    const barW = maxValue > 0 ? Math.max(2, (item.value / maxValue) * barAreaWidth) : 0;
    const color = item.color ?? COLORS[i % COLORS.length];

    rects += `  <text x="${labelWidth - 8}" y="${y + barHeight * 0.72}" text-anchor="end" fill="var(--fg)" font-size="12">${escapeHtml(item.label)}</text>\n`;
    rects += `  <rect x="${labelWidth}" y="${y}" width="${barW}" height="${barHeight}" rx="3" fill="${color}" opacity="0.8"/>\n`;
    rects += `  <text x="${labelWidth + barW + 8}" y="${y + barHeight * 0.72}" fill="var(--fg2)" font-size="11">${fmtNum(item.value)}</text>\n`;
  });

  return `<svg viewBox="0 0 ${width} ${totalHeight}" width="100%" height="${totalHeight}">\n${rects}</svg>`;
}

// ═══════════════════════════════════════
// Line / Area Chart
// ═══════════════════════════════════════

export interface LineChartOptions {
  points: { label: string; value: number }[];
  width: number;
  height: number;
  fill?: boolean;
  color?: string;
}

export function svgLineChart(opts: LineChartOptions): string {
  const { points, width, height, color = COLORS[0] } = opts;
  const fill = opts.fill ?? true;

  if (points.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="var(--fg2)" font-size="12">No data</text>
    </svg>`;
  }

  const pad = { top: 25, right: 20, bottom: 30, left: 55 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const maxVal = Math.max(...points.map(p => p.value), 1);

  // Compute nice Y-axis ticks (4 ticks)
  const step = niceStep(maxVal, 4);
  const yMax = Math.ceil(maxVal / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);

  function px(i: number): number {
    if (points.length === 1) return pad.left + chartW / 2;
    return pad.left + (i / (points.length - 1)) * chartW;
  }
  function py(v: number): number {
    return pad.top + chartH - (v / yMax) * chartH;
  }

  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">\n`;

  // Grid lines + Y labels
  for (const tick of ticks) {
    const y = py(tick);
    svg += `  <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="${tick === 0 ? '0' : '4'}"/>\n`;
    svg += `  <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="var(--fg2)" font-size="10">${fmtNum(tick)}</text>\n`;
  }

  // Area fill
  if (fill && points.length > 1) {
    const polyPoints = points.map((p, i) => `${px(i)},${py(p.value)}`).join(" ");
    const baseline = `${px(points.length - 1)},${py(0)} ${px(0)},${py(0)}`;
    svg += `  <polygon points="${polyPoints} ${baseline}" fill="${color}" opacity="0.1"/>\n`;
  }

  // Line
  if (points.length > 1) {
    const linePoints = points.map((p, i) => `${px(i)},${py(p.value)}`).join(" ");
    svg += `  <polyline points="${linePoints}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>\n`;
  }

  // Data points + X labels
  points.forEach((p, i) => {
    const x = px(i);
    const y = py(p.value);
    svg += `  <circle cx="${x}" cy="${y}" r="4" fill="${color}"/>\n`;
    svg += `  <text x="${x}" y="${py(0) + 18}" text-anchor="middle" fill="var(--fg2)" font-size="10">${escapeHtml(p.label)}</text>\n`;
    // Value label above point
    svg += `  <text x="${x}" y="${y - 8}" text-anchor="middle" fill="var(--fg)" font-size="10" font-weight="600">${fmtNum(p.value)}</text>\n`;
  });

  svg += `</svg>`;
  return svg;
}

// ═══════════════════════════════════════
// Donut / Pie Chart
// ═══════════════════════════════════════

export interface DonutChartOptions {
  segments: { label: string; value: number; color: string }[];
  size: number;
  centerLabel?: string;
  centerSub?: string;
  strokeWidth?: number;
}

export function svgDonutChart(opts: DonutChartOptions): string {
  const { segments, size, centerLabel, centerSub, strokeWidth = 24 } = opts;

  if (segments.length === 0) {
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <text x="${size / 2}" y="${size / 2}" text-anchor="middle" fill="var(--fg2)" font-size="12">No data</text>
    </svg>`;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2 - 4;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">\n`;

  let offset = 0;
  for (const seg of segments) {
    const segLen = total > 0 ? (seg.value / total) * circumference : 0;
    const gapLen = circumference - segLen;
    svg += `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}" `;
    svg += `stroke-dasharray="${segLen} ${gapLen}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>\n`;
    offset += segLen;
  }

  // Center text
  if (centerLabel) {
    svg += `  <text x="${cx}" y="${cy - 2}" text-anchor="middle" fill="var(--fg)" font-size="14" font-weight="700">${escapeHtml(centerLabel)}</text>\n`;
  }
  if (centerSub) {
    svg += `  <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="var(--fg2)" font-size="10">${escapeHtml(centerSub)}</text>\n`;
  }

  svg += `</svg>`;
  return svg;
}

// ═══════════════════════════════════════
// Activity Heatmap (GitHub-style)
// ═══════════════════════════════════════

export interface HeatmapOptions {
  days: { date: Date; value: number }[];
  cellSize: number;
  gap: number;
}

const HEAT_COLORS = [
  "var(--heat-0, #e0e0e0)",
  "var(--heat-1, #6366f133)",
  "var(--heat-2, #6366f166)",
  "var(--heat-3, #6366f199)",
  "var(--heat-4, #6366f1)",
];

export function svgHeatmap(opts: HeatmapOptions): string {
  const { days, cellSize, gap } = opts;
  const step = cellSize + gap;
  const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

  if (days.length === 0) {
    return `<svg viewBox="0 0 200 40" width="200" height="40">
      <text x="100" y="24" text-anchor="middle" fill="var(--fg2)" font-size="12">No data</text>
    </svg>`;
  }

  // Build day map
  const dayMap = new Map<string, number>();
  let maxVal = 0;
  for (const d of days) {
    const key = d.date.toISOString().slice(0, 10);
    dayMap.set(key, d.value);
    if (d.value > maxVal) maxVal = d.value;
  }

  // Find date range: extend to full weeks
  const sorted = [...days].sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstDate = new Date(sorted[0].date);
  const lastDate = new Date(sorted[sorted.length - 1].date);

  // Start from the Sunday of the first week
  const startDate = new Date(firstDate);
  startDate.setUTCDate(startDate.getUTCDate() - startDate.getUTCDay());

  // End on Saturday of the last week
  const endDate = new Date(lastDate);
  endDate.setUTCDate(endDate.getUTCDate() + (6 - endDate.getUTCDay()));

  // Calculate weeks
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);

  const labelOffset = 30;
  const topPad = 20;
  const svgWidth = labelOffset + totalWeeks * step + 120; // extra for legend
  const svgHeight = topPad + 7 * step + 20;

  let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="${svgHeight}">\n`;

  // Day labels (left side)
  for (let d = 0; d < 7; d++) {
    if (DAY_LABELS[d]) {
      svg += `  <text x="${labelOffset - 4}" y="${topPad + d * step + cellSize * 0.8}" text-anchor="end" fill="var(--fg2)" font-size="9">${DAY_LABELS[d]}</text>\n`;
    }
  }

  // Month labels + cells
  let prevMonth = -1;
  const cursor = new Date(startDate);
  for (let w = 0; w < totalWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const key = cursor.toISOString().slice(0, 10);
      const val = dayMap.get(key) ?? 0;
      const level = heatLevel(val, maxVal);
      const x = labelOffset + w * step;
      const y = topPad + d * step;
      svg += `  <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${HEAT_COLORS[level]}"/>\n`;

      // Month label on first week-row
      const month = cursor.getUTCMonth();
      if (d === 0 && month !== prevMonth) {
        const monthName = cursor.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
        svg += `  <text x="${x}" y="${topPad - 6}" fill="var(--fg2)" font-size="9">${monthName}</text>\n`;
        prevMonth = month;
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  // Legend
  const legendX = svgWidth - 110;
  const legendY = svgHeight - 16;
  svg += `  <text x="${legendX}" y="${legendY + 1}" fill="var(--fg2)" font-size="9">Less</text>\n`;
  for (let i = 0; i < 5; i++) {
    svg += `  <rect x="${legendX + 28 + i * (cellSize + 2)}" y="${legendY - 9}" width="${cellSize}" height="${cellSize}" rx="2" fill="${HEAT_COLORS[i]}"/>\n`;
  }
  svg += `  <text x="${legendX + 28 + 5 * (cellSize + 2) + 4}" y="${legendY + 1}" fill="var(--fg2)" font-size="9">More</text>\n`;

  svg += `</svg>`;
  return svg;
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

function heatLevel(value: number, max: number): number {
  if (value === 0 || max === 0) return 0;
  const ratio = value / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function niceStep(maxVal: number, targetTicks: number): number {
  const rough = maxVal / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / mag;
  let nice: number;
  if (residual <= 1.5) nice = 1;
  else if (residual <= 3) nice = 2;
  else if (residual <= 7) nice = 5;
  else nice = 10;
  return nice * mag;
}
