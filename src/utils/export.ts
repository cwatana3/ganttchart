import type { Project } from '../types';
import {
  getVisibleTasks,
  getDepth,
} from './taskTree';
import { toDate, fromDate } from './calendar';
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
  summaryBar: '#374151',
  summaryBarStart: '#4b5563',
  summaryBarStroke: '#1f2937',
  milestone: '#d97706',
  milestoneStart: '#fbbf24',
  milestoneStroke: '#b45309',
  today: '#e74c3c',
  weekendBg: '#252525',
  sunText: '#e74c3c',
  satText: '#5a8fbf',
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
  summaryBar: '#6b7280',
  summaryBarStart: '#9ca3af',
  summaryBarStroke: '#4b5563',
  milestone: '#f59e0b',
  milestoneStart: '#fcd34d',
  milestoneStroke: '#d97706',
  today: '#e74c3c',
  weekendBg: '#f2f2f2',
  sunText: '#e74c3c',
  satText: '#5a8fbf',
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
const BAR_H = 26;
const MSIZE = 8;
const PADDING_X = 32;
const FONT = 'system-ui, sans-serif';
const COL_PAD = 16;
const MIN_COL_W = 50;
const MAX_COL_W = 220;
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

function textWidth(s: string, fontSize: number): number {
  return s.length * fontSize * 0.6;
}

function truncate(s: string, maxPx: number, fontSize: number): string {
  if (textWidth(s, fontSize) <= maxPx) return s;
  let t = s;
  while (t.length > 1 && textWidth(t + '…', fontSize) > maxPx) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

interface ColSpec {
  key: string;
  label: string;
  getValue: (task: any, depth: number) => string;
  fontSize: number;
}

function getColSpecs(C: Colors): { specs: ColSpec[]; colColor: string } {
  return {
    specs: [
      {
        key: 'name', label: 'タスク名',
        getValue: (t, d) => {
          const prefix = d > 0 ? '  '.repeat(d) + '├ ' : '';
          const namePrefix = t.isMilestone ? '◆ ' : prefix;
          return namePrefix + t.name;
        },
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
        key: 'assignee', label: '担当者',
        getValue: (t) => t.assignee || '-',
        fontSize: 12,
      },
    ],
    colColor: C.text,
  };
}

function computeColWidths(tasks: any[], specs: ColSpec[]): {
  tableW: number; colStartX: number[]; colEndX: number[];
} {
  const headerWidths = specs.map(s => textWidth(s.label, 11) + COL_PAD);
  const dataWidths = specs.map(s =>
    tasks.reduce((max, t) => {
      const d = getDepth(t.id, tasks);
      return Math.max(max, textWidth(s.getValue(t, d), s.fontSize));
    }, 0) + COL_PAD,
  );

  let manualWidths: any = {};
  try {
    const saved = localStorage.getItem('gannt-column-widths');
    if (saved) manualWidths = JSON.parse(saved);
  } catch {}

  const widths = specs.map((_, i) => {
    const key = specs[i].key;
    if (manualWidths[key] !== undefined) {
      return manualWidths[key];
    }
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

export function exportToSVG(project: Project, light: boolean, viewMode: 'day' | 'week' | 'month' = 'day'): void {
  const C: Colors = light ? LIGHT : DARK;
  const visibleTasks = getVisibleTasks(project.tasks);
  const { specs, colColor } = getColSpecs(C);

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

  const totalDays = differenceInCalendarDays(maxDate, minDate) + 1;
  const chartW = totalDays * colWidth + PADDING_X * 2;
  const chartH = Math.max(50, visibleTasks.length * ROW_H + 50);
  const { tableW, colStartX, colEndX } = computeColWidths(visibleTasks, specs);
  const svgW = tableW + chartW;
  const svgH = HEADER_H + chartH;

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
    svg.appendChild(lineEl(colStartX[c], 0, colStartX[c], svgH, C.border, 1));
  }

  for (let i = 0; i < visibleTasks.length; i++) {
    const task = visibleTasks[i];
    const depth = getDepth(task.id, project.tasks);
    const rowY = HEADER_H + i * ROW_H;
    const rowMidY = rowY + ROW_H / 2 + 4;

    for (let c = 0; c < specs.length; c++) {
      const raw = specs[c].getValue(task, depth);
      if (!raw) continue;
      const maxPx = colEndX[c] - colStartX[c] - COL_PAD;
      const display = truncate(raw, maxPx, specs[c].fontSize);
      svg.appendChild(textEl(colStartX[c] + 8, rowMidY, display, colColor, { fontSize: specs[c].fontSize }));
    }
  }

  for (let i = 0; i <= visibleTasks.length; i++) {
    const rowY = HEADER_H + i * ROW_H;
    svg.appendChild(lineEl(0, rowY, tableW, rowY, C.border, 1));
  }
  svg.appendChild(lineEl(tableW, 0, tableW, svgH, C.border, 1));

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

    if (cell.isToday) {
      const todayBadge = rectEl(cell.x + cell.width / 2 - 9, 18.5, 18, 18, C.today, undefined, 9);
      chart.appendChild(todayBadge);
    }

    const dayFill = cell.isToday ? '#ffffff' : cell.isSun ? C.sunText : cell.isSat ? C.satText : C.textMuted;
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
    tLine.removeAttribute('shape-rendering');
    chart.appendChild(tLine);
  }

  for (let i = 0; i < visibleTasks.length; i++) {
    const task = visibleTasks[i];
    const barY = HEADER_H + i * ROW_H + (ROW_H - BAR_H) / 2;
    const x1 = getX(task.startDate);
    const x2 = getX(task.endDate);
    const w = Math.max(4, x2 - x1);
    const isSummary = project.tasks.some(t => t.parentId === task.id);

    if (task.isMilestone) {
      const cx = x1 + colWidth / 2;
      const cy = barY + BAR_H / 2;
      const pts = `${cx},${cy - MSIZE} ${cx + MSIZE},${cy} ${cx},${cy + MSIZE} ${cx - MSIZE},${cy}`;
      const poly = svgEl('polygon');
      poly.setAttribute('points', pts);
      poly.setAttribute('fill', 'url(#milestone-gradient)');
      poly.setAttribute('stroke', C.milestoneStroke);
      poly.setAttribute('stroke-width', '1');
      chart.appendChild(poly);
    } else if (isSummary) {
      const dPath = [
        `M ${x1} ${barY}`,
        `H ${x1 + w}`,
        `V ${barY + 16}`,
        `L ${x1 + w - 6} ${barY + 9}`,
        `H ${x1 + 6}`,
        `L ${x1} ${barY + 16}`,
        `Z`
      ].join(' ');
      const path = svgEl('path');
      path.setAttribute('d', dPath);
      path.setAttribute('fill', 'url(#summary-gradient)');
      path.setAttribute('stroke', C.summaryBarStroke);
      path.setAttribute('stroke-width', '1');
      chart.appendChild(path);
    } else {
      const rect = rectEl(x1, barY, w, BAR_H, 'url(#task-gradient)', C.taskBarStroke, 3);
      rect.setAttribute('stroke-width', '1');
      chart.appendChild(rect);
    }
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  downloadBlob(blob, `${project.name}.svg`);
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

export function importFromJSON(file: File): Promise<Project> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = JSON.parse(reader.result as string) as Project;
        resolve(project);
      } catch {
        reject(new Error('ファイルの解析に失敗しました'));
      }
    };
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsText(file);
  });
}
