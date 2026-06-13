import type { Project, Task } from '../types';
import { getFlattenedTasks, getWbsMap } from './taskTree';
import { formatDeps, parseDepsInput, toStorage } from './deps';

const HEADERS = ['行番号', 'WBS', 'タスク名', '期間', '開始日', '終了日', '進捗', '担当者', '先行', 'メモ'] as const;

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * プロジェクトのタスクを CSV 文字列にする（Excel 互換の BOM 付き UTF-8）。
 * 階層は WBS 列、依存は「先行」列の行番号で表現する。
 */
export function exportTasksToCSV(project: Project): string {
  const ordered = getFlattenedTasks(project.tasks);
  const wbsMap = getWbsMap(project.tasks);
  // 行番号と依存解決は project.tasks の並び順（formatDeps と一致）に合わせる
  const rowNumMap = new Map(project.tasks.map((t, i) => [t.id, i + 1]));

  const lines = [HEADERS.join(',')];
  for (const task of ordered) {
    const cells = [
      String(rowNumMap.get(task.id) ?? ''),
      wbsMap.get(task.id) ?? '',
      task.name,
      String(task.duration),
      task.startDate,
      task.endDate,
      String(task.progress),
      task.assignee ?? '',
      formatDeps(task, project.tasks),
      task.notes ?? '',
    ];
    lines.push(cells.map(c => escapeCell(c)).join(','));
  }
  return '﻿' + lines.join('\r\n');
}

/** RFC4180 準拠のシンプルな CSV パーサー（引用符・改行・二重引用符に対応） */
export function parseCSV(text: string): string[][] {
  // 先頭の BOM を除去
  const input = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // CRLF / CR を改行として扱う（直後の \n はスキップ）
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (input[i + 1] === '\n') i++;
    } else {
      field += ch;
    }
  }
  // 末尾フィールド（最終行に改行が無い場合）
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parentWbs(wbs: string): string | null {
  const idx = wbs.lastIndexOf('.');
  return idx === -1 ? null : wbs.slice(0, idx);
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * CSV テキストからタスク配列を復元する。
 * - 階層は WBS 列（"1.2.1" の親は "1.2"）で再構築
 * - 依存は「先行」列の行番号（CSV の行順 1 始まり）で復元
 */
export function parseTasksFromCSV(text: string): Task[] {
  const rows = parseCSV(text).filter(r => r.some(c => c.trim() !== ''));
  if (rows.length === 0) return [];

  // ヘッダー行を検出して読み飛ばす
  const first = rows[0];
  const hasHeader = first[2]?.trim() === 'タスク名' || first[0]?.trim() === '行番号';
  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (dataRows.length === 0) return [];

  // 1パス目: タスク生成（id 割当）と wbs→id マップ
  const tasks: Task[] = [];
  const wbsToId = new Map<string, string>();
  const rowToId: string[] = [];

  for (const r of dataRows) {
    const wbs = (r[1] ?? '').trim();
    const name = (r[2] ?? '').trim() || '無題タスク';
    const duration = Math.max(0, Math.round(Number(r[3]) || 0));
    const startDate = (r[4] ?? '').trim();
    const endDate = (r[5] ?? '').trim() || startDate;
    const progress = Math.max(0, Math.min(100, Math.round(Number(r[6]) || 0)));
    const assignee = (r[7] ?? '').trim();
    const notes = (r[9] ?? '').trim();

    const id = generateId();
    if (wbs) wbsToId.set(wbs, id);
    rowToId.push(id);

    tasks.push({
      id,
      name,
      startDate,
      endDate,
      duration,
      parentId: null,
      isMilestone: duration === 0,
      progress,
      collapsed: false,
      assignee,
      notes: notes || undefined,
    });
  }

  // 2パス目: WBS から親、先行列から依存を復元
  dataRows.forEach((r, i) => {
    const task = tasks[i];
    const wbs = (r[1] ?? '').trim();
    if (wbs) {
      const pWbs = parentWbs(wbs);
      if (pWbs && wbsToId.has(pWbs)) {
        task.parentId = wbsToId.get(pWbs)!;
      }
    }

    const depStr = (r[8] ?? '').trim();
    if (depStr) {
      const { tokens } = parseDepsInput(depStr, rowToId.length);
      const deps = tokens
        .filter(tok => tok.row - 1 !== i) // 自己参照を除外
        .map(tok => toStorage({ id: rowToId[tok.row - 1], type: tok.type, lag: tok.lag }));
      if (deps.length > 0) task.dependencies = deps;
    }
  });

  return tasks;
}
