import type { Project, Task } from '../types';
import {
  getVisibleTasks,
  getDepth,
  getWbsMap,
} from './taskTree';
import { toDate, fromDate } from './calendar';
import { formatDeps, depRefs } from './deps';
import { isDepViolated, criticalTaskIds } from './schedule';
import { darken } from './color';
import { addDays, differenceInCalendarDays } from 'date-fns';

export function exportToJSON(project: Project): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `${project.name}.json`);
}

// ─── color palette ─────────────────────────────────────────────────
const DARK = {
  bg: '#1e1e1e',
  header: '#252525',
  border: '#2d2d2d',
  text: '#e0e0e0',
  textMuted: '#888888',
  accent: '#007acc',
  taskBar: '#1d4ed8',
  taskBarStart: '#3b82f6',
  taskBarStroke: '#1e40af',
  progressFill: '#1e1b4b',
  summaryBar: '#374151',
  summaryBarStart: '#4b5563',
  summaryBarStroke: '#1f2937',
  milestone: '#d97706',
  milestoneStart: '#fbbf24',
  milestoneStroke: '#b45309',
  today: '#ef4444',
  weekendBg: '#252525',
  sunText: '#ef4444',
  satText: '#3b82f6',
} as const;

const LIGHT = {
  bg: '#ffffff',
  header: '#ebebeb',
  border: '#e5e5e5',
  text: '#222222',
  textMuted: '#666666',
  accent: '#007acc',
  taskBar: '#2563eb',
  taskBarStart: '#60a5fa',
  taskBarStroke: '#1d4ed8',
  progressFill: '#172554',
  summaryBar: '#6b7280',
  summaryBarStart: '#9ca3af',
  summaryBarStroke: '#4b5563',
  milestone: '#f59e0b',
  milestoneStart: '#fcd34d',
  milestoneStroke: '#d97706',
  today: '#ef4444',
  weekendBg: '#f2f2f2',
  sunText: '#ef4444',
  satText: '#3b82f6',
} as const;

interface Colors {
  bg: string;
  header: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  taskBar: string;
  taskBarStart: string;
  taskBarStroke: string;
  progressFill: string;
  summaryBar: string;
  summaryBarStart: string;
  summaryBarStroke: string;
  milestone: string;
  milestoneStart: string;
  milestoneStroke: string;
  today: string;
  weekendBg: string;
  sunText: string;
  satText: string;
}

const ROW_H = 34;
const HEADER_H = 38;
const BAR_H = 12;
const MSIZE = 8;
const PADDING_X = 32;
const FONT = 'system-ui, sans-serif';
const COL_PAD = 16;
const MIN_COL_W = 50;
const MAX_COL_W = 160;
const MAX_NAME_W = 400;

function svgEl(tag: string): SVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function textEl(
  x: number, y: number, content: string,
  fill: string,
  opts: { fontSize?: number; anchor?: 'start' | 'middle'; weight?: string } = {},
): SVGTextElement {
  const el = svgEl('text') as SVGTextElement;
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('fill', fill);
  el.setAttribute('font-size', String(opts.fontSize ?? 12));
  el.setAttribute('font-family', FONT);
  if (opts.anchor) el.setAttribute('text-anchor', opts.anchor);
  if (opts.weight) el.setAttribute('font-weight', opts.weight);
  el.textContent = content;
  return el;
}

function rectEl(
  x: number, y: number, w: number, h: number,
  fill: string, stroke?: string, rx?: number,
): SVGRectElement {
  const el = svgEl('rect') as SVGRectElement;
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('width', String(w));
  el.setAttribute('height', String(h));
  el.setAttribute('fill', fill);
  if (stroke) el.setAttribute('stroke', stroke);
  if (rx !== undefined) { el.setAttribute('rx', String(rx)); el.setAttribute('ry', String(rx)); }
  return el;
}

function lineEl(
  x1: number, y1: number, x2: number, y2: number,
  stroke: string, sw = 0.5,
): SVGLineElement {
  const el = svgEl('line') as SVGLineElement;
  el.setAttribute('x1', String(x1));
  el.setAttribute('y1', String(y1));
  el.setAttribute('x2', String(x2));
  el.setAttribute('y2', String(y2));
  el.setAttribute('stroke', stroke);
  el.setAttribute('stroke-width', String(sw));
  return el;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(s: string, fontSize: number): number {
  if (measureCtx === undefined) {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  if (!measureCtx) {
    // Approximation when canvas 2D is unavailable (e.g. jsdom)
    let w = 0;
    for (const ch of s) w += ch > 'ÿ' ? fontSize : fontSize * 0.6;
    return w;
  }
  measureCtx.font = `${fontSize}px ${FONT}`;
  return measureCtx.measureText(s).width;
}

function truncate(s: string, maxPx: number, fontSize: number): string {
  if (textWidth(s, fontSize) <= maxPx + 0.01) return s;
  let t = s;
  while (t.length > 1 && textWidth(t + '…', fontSize) > maxPx + 0.01) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

interface ColSpec {
  key: string;
  label: string;
  getValue: (task: Task) => string;
  fontSize: number;
  color?: string;
}

function getColSpecs(C: Colors, tasks: Task[]): { specs: ColSpec[]; colColor: string } {
  const wbsMap = getWbsMap(tasks);
  return {
    specs: [
      {
        key: 'wbs', label: '＃',
        getValue: (t) => wbsMap.get(t.id) ?? '',
        fontSize: 12,
        color: C.textMuted,
      },
      {
        key: 'name', label: 'タスク名',
        getValue: (t) => t.name,
        fontSize: 12,
      },
      {
        key: 'duration', label: '期間',
        getValue: (t) => t.isMilestone ? '' : `${t.duration}日`,
        fontSize: 12,
      },
      {
        key: 'startDate', label: '開始日',
        getValue: (t) => t.startDate,
        fontSize: 12,
      },
      {
        key: 'endDate', label: '終了日',
        getValue: (t) => t.endDate,
        fontSize: 12,
      },
      {
        key: 'progress', label: '進捗',
        getValue: (t) => `${t.progress}%`,
        fontSize: 12,
      },
      {
        key: 'assignee', label: '担当者',
        getValue: (t) => t.assignee || '-',
        fontSize: 12,
      },
      {
        key: 'dependencies', label: '先行',
        getValue: (t) => formatDeps(t, tasks, wbsMap) || '-',
        fontSize: 12,
      },
      {
        key: 'notes', label: 'メモ',
        getValue: (t) => t.notes || '-',
        fontSize: 12,
      },
    ],
    colColor: C.text,
  };
}

function computeColWidths(tasks: Task[], specs: ColSpec[]): {
  tableW: number; colStartX: number[]; colEndX: number[];
} {
  const headerWidths = specs.map(s => textWidth(s.label, 11) + COL_PAD);
  const dataWidths = specs.map(s =>
    tasks.reduce((max, t) => {
      const d = getDepth(t.id, tasks);
      let w = textWidth(s.getValue(t), s.fontSize);
      if (s.key === 'name') {
        w += d * 16 + 30; // Add indent and icon space
      }
      return Math.max(max, w);
    }, 0) + COL_PAD,
  );

  const widths = specs.map((_, i) => {
    const key = specs[i].key;
    const w = Math.max(headerWidths[i], dataWidths[i], MIN_COL_W);
    if (key === 'name') return Math.min(w, MAX_NAME_W);
    return Math.min(w, MAX_COL_W);
  });

  const tableW = widths.reduce((a, b) => a + b, 0);
  const colStartX: number[] = [0];
  for (let i = 1; i < widths.length; i++) {
    colStartX.push(colStartX[i - 1] + widths[i - 1]);
  }
  const colEndX = colStartX.map((s, i) => s + widths[i]);
  return { tableW, colStartX, colEndX };
}

// ─── export ────────────────────────────────────────────────────────

export interface ExportDateRange {
  start?: string;
  end?: string;
}

export function buildGanttSvg(project: Project, light: boolean, viewMode: 'day' | 'week' | 'month' = 'day', showCriticalPath = false, dateRange?: ExportDateRange): SVGSVGElement {
  const C: Colors = light ? LIGHT : DARK;
  const visibleTasks = getVisibleTasks(project.tasks);
  const { specs, colColor } = getColSpecs(C, project.tasks);
  const criticalIds = showCriticalPath ? criticalTaskIds(project.tasks, project.calendar) : new Set<string>();
  const CRITICAL_STROKE = '#e11d48';

  // ─── date range & scaling ──────────────────────────────────
  const colWidth = viewMode === 'week' ? 8 : viewMode === 'month' ? 2 : 32;
  const todayStr = fromDate(new Date());

  let minDate: Date;
  let maxDate: Date;

  if (visibleTasks.length === 0) {
    let today = new Date();
    if (viewMode === 'week') {
      today = addDays(today, -today.getDay());
    } else if (viewMode === 'month') {
      today = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    minDate = today;
    maxDate = addDays(today, viewMode === 'month' ? 365 : viewMode === 'week' ? 90 : 30);
  } else {
    let min = toDate('2099-12-31');
    let max = toDate('2000-01-01');
    for (const t of visibleTasks) {
      const s = toDate(t.startDate);
      const e = toDate(t.endDate);
      if (s < min) min = s;
      if (e > max) max = e;
    }

    let startPadding = -5;
    let endPadding = 10;
    if (viewMode === 'week') {
      startPadding = -14;
      endPadding = 28;
    } else if (viewMode === 'month') {
      startPadding = -60;
      endPadding = 120;
    }

    minDate = addDays(min, startPadding);
    maxDate = addDays(max, endPadding);

    if (viewMode === 'week') {
      const day = minDate.getDay();
      minDate = addDays(minDate, -day);
    } else if (viewMode === 'month') {
      minDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    }
  }

  // ユーザー指定の期間で上書き（カラム軸のみ。タスク行はそのまま表示）
  if (dateRange?.start) minDate = toDate(dateRange.start);
  if (dateRange?.end) maxDate = toDate(dateRange.end);
  if (maxDate < minDate) maxDate = minDate;

  const totalDays = differenceInCalendarDays(maxDate, minDate) + 1;
  const chartW = totalDays * colWidth + PADDING_X * 2;
  const { tableW, colStartX, colEndX } = computeColWidths(visibleTasks, specs);
  const svgW = tableW + chartW;
  const rowsBottomY = HEADER_H + visibleTasks.length * ROW_H;
  // +1 so the 1px bottom border is not clipped at the SVG edge
  const svgH = Math.max(rowsBottomY, HEADER_H + ROW_H) + 1;

  function getX(dateStr: string): number {
    return differenceInCalendarDays(toDate(dateStr), minDate) * colWidth + PADDING_X;
  }

  const todayX = getX(todayStr);

  const timelineDates = Array.from({ length: totalDays }, (_, i) => {
    const date = addDays(minDate, i);
    const x = i * colWidth + PADDING_X;
    return { date, x };
  });

  // ─── Header cells & grids ──────────────────────────────────
  const bottomHeaderCells: {
    key: string;
    x: number;
    width: number;
    label: string;
    isWeekend?: boolean;
    isToday?: boolean;
    isSun?: boolean;
    isSat?: boolean;
  }[] = [];

  if (viewMode === 'day') {
    timelineDates.forEach(({ date, x }) => {
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isSun = dayOfWeek === 0;
      const isSat = dayOfWeek === 6;
      const isToday = fromDate(date) === todayStr;
      bottomHeaderCells.push({
        key: `day-${x}`,
        x,
        width: colWidth,
        label: String(date.getDate()),
        isWeekend,
        isToday,
        isSun,
        isSat,
      });
    });
  } else if (viewMode === 'week') {
    timelineDates.forEach(({ date, x }, idx) => {
      if (date.getDay() === 0 || idx === 0) {
        let nextSundayIdx = timelineDates.findIndex((td, i) => i > idx && td.date.getDay() === 0);
        if (nextSundayIdx === -1) {
          nextSundayIdx = timelineDates.length;
        }
        const daysSpan = nextSundayIdx - idx;
        const width = daysSpan * colWidth;
        bottomHeaderCells.push({
          key: `week-${x}`,
          x,
          width,
          label: `${date.getMonth() + 1}/${date.getDate()}`,
        });
      }
    });
  } else if (viewMode === 'month') {
    timelineDates.forEach(({ date, x }, idx) => {
      if (date.getDate() === 1 || idx === 0) {
        let nextMonthIdx = timelineDates.findIndex((td, i) => i > idx && td.date.getDate() === 1);
        if (nextMonthIdx === -1) {
          nextMonthIdx = timelineDates.length;
        }
        const daysSpan = nextMonthIdx - idx;
        const width = daysSpan * colWidth;
        bottomHeaderCells.push({
          key: `month-${x}`,
          x,
          width,
          label: `${date.getMonth() + 1}月`,
        });
      }
    });
  }

  const topHeaderCells: {
    key: string;
    x: number;
    width: number;
    label: string;
  }[] = [];

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  if (viewMode === 'month') {
    const yearBlocks: { year: number; startIdx: number; endIdx: number }[] = [];
    timelineDates.forEach((td, i) => {
      const y = td.date.getFullYear();
      if (yearBlocks.length === 0 || yearBlocks[yearBlocks.length - 1].year !== y) {
        yearBlocks.push({ year: y, startIdx: i, endIdx: i });
      } else {
        yearBlocks[yearBlocks.length - 1].endIdx = i;
      }
    });
    yearBlocks.forEach((block, idx) => {
      const startX = timelineDates[block.startIdx].x;
      const endX = timelineDates[block.endIdx].x + colWidth;
      topHeaderCells.push({
        key: `year-${block.year}-${idx}`,
        x: startX,
        width: endX - startX,
        label: `${block.year}年`,
      });
    });
  } else {
    const monthBlocks: { month: number; year: number; startIdx: number; endIdx: number }[] = [];
    timelineDates.forEach((td, i) => {
      const m = td.date.getMonth();
      const y = td.date.getFullYear();
      if (monthBlocks.length === 0 || monthBlocks[monthBlocks.length - 1].month !== m || monthBlocks[monthBlocks.length - 1].year !== y) {
        monthBlocks.push({ month: m, year: y, startIdx: i, endIdx: i });
      } else {
        monthBlocks[monthBlocks.length - 1].endIdx = i;
      }
    });
    monthBlocks.forEach((block, idx) => {
      const startX = timelineDates[block.startIdx].x;
      const endX = timelineDates[block.endIdx].x + colWidth;
      const showYear = idx === 0 || monthBlocks[idx - 1].year !== block.year;
      const label = showYear ? `${block.year}年 ${monthNames[block.month]}` : monthNames[block.month];
      topHeaderCells.push({
        key: `month-${block.year}-${block.month}-${idx}`,
        x: startX,
        width: endX - startX,
        label,
      });
    });
  }

  const weekendBgs: { x: number; width: number }[] = [];
  if (viewMode !== 'month') {
    timelineDates.forEach(({ date, x }) => {
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendBgs.push({ x, width: colWidth });
      }
    });
  }

  // ─── SVG root ────────────────────────────────────────────────
  const svg = svgEl('svg') as SVGSVGElement;
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(svgW));
  svg.setAttribute('height', String(svgH));
  svg.appendChild(rectEl(0, 0, svgW, svgH, C.bg));

  // ─── Defs (Gradients & Filters) ──────────────────────────────
  const defs = svgEl('defs');

  // Task gradient
  const taskGrad = svgEl('linearGradient');
  taskGrad.setAttribute('id', 'task-gradient');
  taskGrad.setAttribute('x1', '0%');
  taskGrad.setAttribute('y1', '0%');
  taskGrad.setAttribute('x2', '0%');
  taskGrad.setAttribute('y2', '100%');
  const taskStop1 = svgEl('stop');
  taskStop1.setAttribute('offset', '0%');
  taskStop1.setAttribute('stop-color', C.taskBarStart);
  const taskStop2 = svgEl('stop');
  taskStop2.setAttribute('offset', '100%');
  taskStop2.setAttribute('stop-color', C.taskBar);
  taskGrad.appendChild(taskStop1);
  taskGrad.appendChild(taskStop2);
  defs.appendChild(taskGrad);

  // Summary gradient
  const summaryGrad = svgEl('linearGradient');
  summaryGrad.setAttribute('id', 'summary-gradient');
  summaryGrad.setAttribute('x1', '0%');
  summaryGrad.setAttribute('y1', '0%');
  summaryGrad.setAttribute('x2', '0%');
  summaryGrad.setAttribute('y2', '100%');
  const summaryStop1 = svgEl('stop');
  summaryStop1.setAttribute('offset', '0%');
  summaryStop1.setAttribute('stop-color', C.summaryBarStart);
  const summaryStop2 = svgEl('stop');
  summaryStop2.setAttribute('offset', '100%');
  summaryStop2.setAttribute('stop-color', C.summaryBar);
  summaryGrad.appendChild(summaryStop1);
  summaryGrad.appendChild(summaryStop2);
  defs.appendChild(summaryGrad);

  // Milestone gradient
  const milestoneGrad = svgEl('linearGradient');
  milestoneGrad.setAttribute('id', 'milestone-gradient');
  milestoneGrad.setAttribute('x1', '0%');
  milestoneGrad.setAttribute('y1', '0%');
  milestoneGrad.setAttribute('x2', '100%');
  milestoneGrad.setAttribute('y2', '100%');
  const milestoneStop1 = svgEl('stop');
  milestoneStop1.setAttribute('offset', '0%');
  milestoneStop1.setAttribute('stop-color', C.milestoneStart);
  const milestoneStop2 = svgEl('stop');
  milestoneStop2.setAttribute('offset', '100%');
  milestoneStop2.setAttribute('stop-color', C.milestone);
  milestoneGrad.appendChild(milestoneStop1);
  milestoneGrad.appendChild(milestoneStop2);
  defs.appendChild(milestoneGrad);

  // Dependency arrow marker (solid color, no transparency)
  const marker = svgEl('marker');
  marker.setAttribute('id', 'dependency-arrow');
  marker.setAttribute('viewBox', '0 0 6 6');
  marker.setAttribute('refX', '6');
  marker.setAttribute('refY', '3');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto');
  const markerPath = svgEl('path');
  markerPath.setAttribute('d', 'M 0 0 L 6 3 L 0 6 z');
  markerPath.setAttribute('fill', C.accent);
  marker.appendChild(markerPath);
  defs.appendChild(marker);

  // Violated-dependency arrow marker (solid red)
  const markerV = svgEl('marker');
  markerV.setAttribute('id', 'dependency-arrow-violated');
  markerV.setAttribute('viewBox', '0 0 6 6');
  markerV.setAttribute('refX', '6');
  markerV.setAttribute('refY', '3');
  markerV.setAttribute('markerWidth', '6');
  markerV.setAttribute('markerHeight', '6');
  markerV.setAttribute('orient', 'auto');
  const markerVPath = svgEl('path');
  markerVPath.setAttribute('d', 'M 0 0 L 6 3 L 0 6 z');
  markerVPath.setAttribute('fill', '#ef4444');
  markerV.appendChild(markerVPath);
  defs.appendChild(markerV);

  svg.appendChild(defs);

  // ================================================================
  //  TABLE SECTION
  // ================================================================
  const tableHeaderBg = rectEl(0, 0, tableW, HEADER_H, C.header);
  tableHeaderBg.setAttribute('shape-rendering', 'crispEdges');
  svg.appendChild(tableHeaderBg);

  for (let c = 0; c < specs.length; c++) {
    svg.appendChild(textEl(colStartX[c] + 8, HEADER_H / 2 + 4, specs[c].label, C.textMuted, { fontSize: 11, weight: '600' }));
  }
  for (let c = 1; c < specs.length; c++) {
    svg.appendChild(lineEl(colStartX[c], 0, colStartX[c], rowsBottomY, C.border, 1));
  }

  for (let i = 0; i < visibleTasks.length; i++) {
    const task = visibleTasks[i];
    const depth = getDepth(task.id, project.tasks);
    const rowY = HEADER_H + i * ROW_H;
    const rowMidY = rowY + ROW_H / 2 + 4;

    for (let c = 0; c < specs.length; c++) {
      const spec = specs[c];
      const raw = spec.getValue(task);

      if (spec.key === 'name') {
        // 1. Draw Icon / Chevron
        const iconX = colStartX[c] + 12 + depth * 16 + 6;
        const iconY = rowY + ROW_H / 2;
        const hasChildren = project.tasks.some(t => t.parentId === task.id);
        
        if (hasChildren) {
          // Chevron icon (expanded ▼ / collapsed ▶)
          const chevron = svgEl('path');
          if (task.collapsed) {
            // Right chevron ▶
            chevron.setAttribute('d', `M ${iconX - 2} ${iconY - 4} L ${iconX + 3} ${iconY} L ${iconX - 2} ${iconY + 4} Z`);
          } else {
            // Down chevron ▼
            chevron.setAttribute('d', `M ${iconX - 4} ${iconY - 2} L ${iconX} ${iconY + 3} L ${iconX + 4} ${iconY - 2} Z`);
          }
          chevron.setAttribute('fill', C.textMuted);
          svg.appendChild(chevron);
        } else if (task.isMilestone) {
          // Milestone diamond icon
          const diamond = svgEl('polygon');
          const points = [
            `${iconX},${iconY - 4.5}`,
            `${iconX + 4.5},${iconY}`,
            `${iconX},${iconY + 4.5}`,
            `${iconX - 4.5},${iconY}`
          ].join(' ');
          diamond.setAttribute('points', points);
          diamond.setAttribute('fill', 'url(#milestone-gradient)');
          diamond.setAttribute('stroke', C.milestoneStroke);
          diamond.setAttribute('stroke-width', '1');
          svg.appendChild(diamond);
        }

        // 2. Render name text
        const textX = colStartX[c] + 12 + depth * 16 + 18;
        const maxPx = colEndX[c] - textX - 8;
        const display = truncate(raw, maxPx, spec.fontSize);
        svg.appendChild(textEl(textX, rowMidY, display, colColor, { fontSize: spec.fontSize }));
      } else {
        if (!raw) continue;
        const maxPx = colEndX[c] - colStartX[c] - COL_PAD;
        const display = truncate(raw, maxPx, spec.fontSize);
        svg.appendChild(textEl(colStartX[c] + 8, rowMidY, display, spec.color ?? colColor, { fontSize: spec.fontSize }));
      }
    }
  }

  for (let i = 0; i <= visibleTasks.length; i++) {
    const rowY = HEADER_H + i * ROW_H;
    svg.appendChild(lineEl(0, rowY, tableW, rowY, C.border, 1));
  }
  svg.appendChild(lineEl(tableW, 0, tableW, rowsBottomY, C.border, 1));

  // ================================================================
  //  GANTT CHART SECTION
  // ================================================================
  const chart = svgEl('g') as SVGGElement;
  chart.setAttribute('transform', `translate(${tableW}, 0)`);
  svg.appendChild(chart);

  const chartHeaderBg = rectEl(0, 0, chartW, HEADER_H, C.header);
  chartHeaderBg.setAttribute('shape-rendering', 'crispEdges');
  chart.appendChild(chartHeaderBg);

  // Top header cells
  topHeaderCells.forEach((cell) => {
    const centerX = cell.x + cell.width / 2;
    chart.appendChild(lineEl(cell.x, 0, cell.x, 18, C.border, 1));
    chart.appendChild(textEl(centerX, 13, cell.label, C.textMuted, { fontSize: 11, anchor: 'middle' }));
  });
  if (topHeaderCells.length > 0) {
    const last = topHeaderCells[topHeaderCells.length - 1];
    const endX = last.x + last.width;
    chart.appendChild(lineEl(endX, 0, endX, 18, C.border, 1));
  }

  chart.appendChild(lineEl(0, 18, chartW, 18, C.border, 1));
  chart.appendChild(lineEl(0, HEADER_H, chartW, HEADER_H, C.border, 1));

  // Bottom header cells
  bottomHeaderCells.forEach((cell) => {
    const centerX = cell.x + cell.width / 2;
    if (cell.isWeekend) {
      const wBg = rectEl(cell.x, 18, cell.width, HEADER_H - 18, C.weekendBg);
      wBg.setAttribute('shape-rendering', 'crispEdges');
      chart.appendChild(wBg);
    }
    chart.appendChild(lineEl(cell.x, 18, cell.x, HEADER_H, C.border, 1));

    const dayFill = cell.isToday ? C.today : cell.isSun ? C.sunText : cell.isSat ? C.satText : C.textMuted;
    chart.appendChild(textEl(centerX, 30, cell.label, dayFill, { fontSize: 10, anchor: 'middle', weight: cell.isToday ? 'bold' : undefined }));
  });
  if (bottomHeaderCells.length > 0) {
    const last = bottomHeaderCells[bottomHeaderCells.length - 1];
    const endX = last.x + last.width;
    chart.appendChild(lineEl(endX, 18, endX, HEADER_H, C.border, 1));
  }



  // Weekend background columns in bars
  weekendBgs.forEach((bg) => {
    const wColBg = rectEl(bg.x, HEADER_H, bg.width, visibleTasks.length * ROW_H, C.weekendBg);
    wColBg.setAttribute('shape-rendering', 'crispEdges');
    chart.appendChild(wColBg);
  });

  // Vertical grid lines in bars
  bottomHeaderCells.forEach((cell) => {
    chart.appendChild(lineEl(cell.x, HEADER_H, cell.x, HEADER_H + visibleTasks.length * ROW_H, C.border, 1));
  });
  if (bottomHeaderCells.length > 0) {
    const last = bottomHeaderCells[bottomHeaderCells.length - 1];
    const endX = last.x + last.width;
    chart.appendChild(lineEl(endX, HEADER_H, endX, HEADER_H + visibleTasks.length * ROW_H, C.border, 1));
  }

  for (let i = 0; i <= visibleTasks.length; i++) {
    const rowY = HEADER_H + i * ROW_H;
    chart.appendChild(lineEl(0, rowY, chartW, rowY, C.border, 1));
  }

  if (todayX >= PADDING_X && todayX <= PADDING_X + totalDays * colWidth) {
    const tLine = lineEl(todayX, HEADER_H, todayX, HEADER_H + visibleTasks.length * ROW_H, C.today, 1.5);
    tLine.setAttribute('stroke-dasharray', '4,2');
    chart.appendChild(tLine);
  }

  // Draw dependency connection lines (solid color, no transparency)
  visibleTasks.forEach((task, succIdx) => {
    depRefs(task).forEach((ref) => {
      const predIdx = visibleTasks.findIndex(t => t.id === ref.id);
      if (predIdx === -1) return;

      const predTask = visibleTasks[predIdx];
      const predX = ref.type[0] === 'F' ? getX(predTask.endDate) : getX(predTask.startDate);
      const predY = HEADER_H + predIdx * ROW_H + ROW_H / 2;

      const succX = ref.type[1] === 'S' ? getX(task.startDate) : getX(task.endDate);
      const succY = HEADER_H + succIdx * ROW_H + ROW_H / 2;

      const startX = predX;
      const startY = predY;
      const endX = succX;
      const endY = succY;

      let points: string = '';

      if (endX >= startX + 12) {
        const midX = startX + (endX - startX) / 2;
        points = [
          `${startX},${startY}`,
          `${midX},${startY}`,
          `${midX},${endY}`,
          `${endX},${endY}`
        ].join(' ');
      } else {
        const offsetOut = startX + 6;
        const offsetIn = endX - 6;
        const midY = startY + (endY - startY) / 2;
        points = [
          `${startX},${startY}`,
          `${offsetOut},${startY}`,
          `${offsetOut},${midY}`,
          `${offsetIn},${midY}`,
          `${offsetIn},${endY}`,
          `${endX},${endY}`
        ].join(' ');
      }

      const violated = isDepViolated(task, predTask, ref, project.calendar);
      const poly = svgEl('polyline');
      poly.setAttribute('points', points);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', violated ? '#ef4444' : C.accent);
      poly.setAttribute('stroke-width', '1.5');
      if (violated) poly.setAttribute('stroke-dasharray', '5 3');
      poly.setAttribute('marker-end', violated ? 'url(#dependency-arrow-violated)' : 'url(#dependency-arrow)');
      chart.appendChild(poly);
    });
  });

  for (let i = 0; i < visibleTasks.length; i++) {
    const task = visibleTasks[i];
    const barY = HEADER_H + i * ROW_H + (ROW_H - BAR_H) / 2;
    const x1 = getX(task.startDate);
    const x2 = getX(task.endDate);
    const w = Math.max(4, x2 - x1);
    const isSummary = project.tasks.some(t => t.parentId === task.id);
    const isCritical = criticalIds.has(task.id);

    // Baseline (planned) bar beneath the task bar — solid color (no transparency)
    const base = project.baseline?.[task.id];
    if (base) {
      const bx1 = getX(base.startDate);
      const bx2 = getX(base.endDate);
      const bw = Math.max(3, bx2 - bx1);
      const baseRect = rectEl(bx1, barY + BAR_H + 2, bw, 3, '#94a3b8', undefined, 1);
      chart.appendChild(baseRect);
    }

    if (task.isMilestone) {
      const cx = x1 + colWidth / 2;
      const cy = barY + BAR_H / 2;
      const pts = `${cx},${cy - MSIZE} ${cx + MSIZE},${cy} ${cx},${cy + MSIZE} ${cx - MSIZE},${cy}`;
      const poly = svgEl('polygon');
      poly.setAttribute('points', pts);
      poly.setAttribute('fill', task.color ?? 'url(#milestone-gradient)');
      poly.setAttribute('stroke', isCritical ? CRITICAL_STROKE : task.color ? darken(task.color, 0.7) : C.milestoneStroke);
      poly.setAttribute('stroke-width', isCritical ? '2.5' : '1');
      chart.appendChild(poly);
    } else if (isSummary) {
        const dPath = [
          `M ${x1} ${barY}`,
          `H ${x1 + w}`,
          `V ${barY + 14}`,
          `L ${x1 + w - 4} ${barY + 8}`,
          `H ${x1 + 4}`,
          `L ${x1} ${barY + 14}`,
          `Z`
        ].join(' ');
      const path = svgEl('path');
      path.setAttribute('d', dPath);
      path.setAttribute('fill', 'url(#summary-gradient)');
      path.setAttribute('stroke', isCritical ? CRITICAL_STROKE : C.summaryBarStroke);
      path.setAttribute('stroke-width', isCritical ? '2.5' : '1');
      chart.appendChild(path);
    } else {
      const rect = rectEl(
        x1, barY, w, BAR_H,
        task.color ?? 'url(#task-gradient)',
        isCritical ? CRITICAL_STROKE : task.color ? darken(task.color, 0.7) : C.taskBarStroke,
        3,
      );
      rect.setAttribute('stroke-width', isCritical ? '2.5' : '1');
      chart.appendChild(rect);

      // Progress fill (solid color blend — no transparency allowed in export)
      const prog = Math.max(0, Math.min(100, task.progress ?? 0));
      if (prog > 0) {
        const doneColor = task.color ? darken(task.color, 0.72) : C.progressFill;
        chart.appendChild(rectEl(x1, barY, w * prog / 100, BAR_H, doneColor, undefined, 3));
      }
    }
  }

  return svg;
}

export function exportToSVG(project: Project, light: boolean, viewMode: 'day' | 'week' | 'month' = 'day', showCriticalPath = false, dateRange?: ExportDateRange): void {
  const svg = buildGanttSvg(project, light, viewMode, showCriticalPath, dateRange);
  const svgString = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  downloadBlob(blob, `${project.name}.svg`);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('SVG画像の読み込みに失敗しました'));
    img.src = url;
  });
}

/** ガントを高解像度 PNG の Blob にラスタライズする（不透明背景付き） */
async function renderGanttPngBlob(
  project: Project,
  light: boolean,
  viewMode: 'day' | 'week' | 'month',
  showCriticalPath: boolean,
  scale: number,
  dateRange?: ExportDateRange,
): Promise<Blob> {
  const svg = buildGanttSvg(project, light, viewMode, showCriticalPath, dateRange);
  const width = Number(svg.getAttribute('width')) || 800;
  const height = Number(svg.getAttribute('height')) || 600;
  const svgString = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D コンテキストを取得できませんでした');
    // 不透明背景を保証（SVG 先頭の背景 rect と同色）
    ctx.fillStyle = light ? '#ffffff' : '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('画像の生成に失敗しました');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** ガントを高解像度 PNG にラスタライズしてダウンロードする */
export async function exportToPNG(
  project: Project,
  light: boolean,
  viewMode: 'day' | 'week' | 'month' = 'day',
  showCriticalPath = false,
  scale = 2,
  dateRange?: ExportDateRange,
): Promise<void> {
  const blob = await renderGanttPngBlob(project, light, viewMode, showCriticalPath, scale, dateRange);
  downloadBlob(blob, `${project.name}.png`);
}

/** クリップボードへの画像コピーに対応しているか */
export function canCopyImageToClipboard(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.clipboard
    && typeof window !== 'undefined'
    && typeof window.ClipboardItem !== 'undefined';
}

/**
 * ガント図を PNG 画像としてクリップボードにコピーする。
 * PowerPoint や Word などに Ctrl+V でそのまま貼り付けられる。
 * ClipboardItem には Blob の Promise を渡し、ユーザー操作（クリック）の
 * コンテキストを保ったまま非同期生成する（Safari 対策）。
 */
export async function copyGanttToClipboard(
  project: Project,
  light: boolean,
  viewMode: 'day' | 'week' | 'month' = 'day',
  showCriticalPath = false,
  scale = 2,
  dateRange?: ExportDateRange,
): Promise<void> {
  if (!canCopyImageToClipboard()) {
    throw new Error('このブラウザはクリップボードへの画像コピーに対応していません');
  }
  const blobPromise = renderGanttPngBlob(project, light, viewMode, showCriticalPath, scale, dateRange);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
}

/** ガントを別ウィンドウで開いて印刷ダイアログを表示する */
export function printGantt(
  project: Project,
  light: boolean,
  viewMode: 'day' | 'week' | 'month' = 'day',
  showCriticalPath = false,
  dateRange?: ExportDateRange,
): void {
  const svg = buildGanttSvg(project, light, viewMode, showCriticalPath, dateRange);
  const svgString = new XMLSerializer().serializeToString(svg);
  const win = window.open('', '_blank');
  if (!win) {
    alert('印刷ウィンドウを開けませんでした。ポップアップを許可してください。');
    return;
  }
  const bg = light ? '#ffffff' : '#1e1e1e';
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${project.name}</title>` +
    `<style>@page{margin:10mm;}html,body{margin:0;background:${bg};}svg{max-width:100%;height:auto;display:block;}</style>` +
    `</head><body>${svgString}</body></html>`
  );
  win.document.close();
  win.focus();
  setTimeout(() => {
    try { win.print(); } catch { /* ユーザーが手動で印刷 */ }
  }, 300);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function validateProject(obj: any): obj is Project {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.name !== 'string') return false;
  
  // Validate calendar
  const cal = obj.calendar;
  if (!cal || typeof cal !== 'object') return false;
  if (!Array.isArray(cal.workingDays) || !cal.workingDays.every((d: any) => typeof d === 'number')) return false;
  if (!Array.isArray(cal.holidays) || !cal.holidays.every((h: any) => typeof h === 'string')) return false;
  
  // Validate tasks
  if (!Array.isArray(obj.tasks)) return false;
  for (const t of obj.tasks) {
    if (!t || typeof t !== 'object') return false;
    if (typeof t.id !== 'string') return false;
    if (typeof t.name !== 'string') return false;
    if (typeof t.startDate !== 'string') return false;
    if (typeof t.endDate !== 'string') return false;
    if (typeof t.duration !== 'number') return false;
    if (t.parentId !== null && typeof t.parentId !== 'string') return false;
    if (typeof t.isMilestone !== 'boolean') return false;
    if (typeof t.progress !== 'number') return false;
    if (typeof t.collapsed !== 'boolean') return false;
    if (t.assignee !== undefined && typeof t.assignee !== 'string') return false;
    if (t.notes !== undefined && typeof t.notes !== 'string') return false;
    if (t.color !== undefined && typeof t.color !== 'string') return false;
    if (t.dependencies !== undefined && (!Array.isArray(t.dependencies) || !t.dependencies.every((d: any) =>
      typeof d === 'string' ||
      (d && typeof d === 'object' && typeof d.id === 'string' &&
        ['FS', 'SS', 'FF', 'SF'].includes(d.type) && typeof d.lag === 'number')
    ))) return false;
  }

  if (obj.autoSchedule !== undefined && typeof obj.autoSchedule !== 'boolean') return false;
  if (obj.baseline !== undefined) {
    if (!obj.baseline || typeof obj.baseline !== 'object' || Array.isArray(obj.baseline)) return false;
    for (const b of Object.values(obj.baseline) as any[]) {
      if (!b || typeof b.startDate !== 'string' || typeof b.endDate !== 'string') return false;
    }
  }

  // Structural integrity — duplicate ids, dangling parents, or parent cycles
  // would hang or corrupt the tree traversal utilities
  const byId = new Map<string, any>();
  for (const t of obj.tasks) {
    if (byId.has(t.id)) return false;
    byId.set(t.id, t);
  }
  for (const t of obj.tasks) {
    if (t.parentId !== null && !byId.has(t.parentId)) return false;
  }
  for (const t of obj.tasks) {
    const seen = new Set<string>([t.id]);
    let cur = t;
    while (cur.parentId) {
      if (seen.has(cur.parentId)) return false;
      seen.add(cur.parentId);
      cur = byId.get(cur.parentId);
    }
  }

  return true;
}

export function importFromJSON(file: File): Promise<Project> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = JSON.parse(reader.result as string);
        if (validateProject(project)) {
          resolve(project);
        } else {
          reject(new Error('インポートされたデータの形式が正しくありません'));
        }
      } catch {
        reject(new Error('ファイルの解析に失敗しました'));
      }
    };
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsText(file);
  });
}
