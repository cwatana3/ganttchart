import type { Project, Task } from '../types';
import { getFlattenedTasks, getWbsMap } from './taskTree';
import { formatDeps, parseDepsInput, toStorage } from './deps';

const HEADERS = ['＃', 'タスク名', '期間', '開始日', '終了日', '進捗', '担当者', '先行', 'メモ'] as const;

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

  const lines = [HEADERS.join(',')];
  for (const task of ordered) {
    const cells = [
      wbsMap.get(task.id) ?? '',
      task.name,
      String(task.duration),
      task.startDate,
      task.endDate,
      String(task.progress),
      task.assignee ?? '',
      formatDeps(task, project.tasks, wbsMap),
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
  const hasHeader =
    first[0]?.trim() === '行番号' ||
    first[0]?.trim() === 'WBS' ||
    first[0]?.trim() === '＃' ||
    first[0]?.trim() === '#' ||
    first[1]?.trim() === 'タスク名' ||
    first[2]?.trim() === 'タスク名';
  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (dataRows.length === 0) return [];

  // 列のインデックスをヘッダーに基づいてマッピング、またはデフォルトで判断
  let isOldFormat = true;
  if (hasHeader) {
    isOldFormat = first[0]?.trim() === '行番号';
  } else {
    isOldFormat = first.length >= 10;
  }

  const offset = isOldFormat ? 1 : 0;

  // 1パス目: タスク生成（id 割当）と wbs→id マップ
  const tasks: Task[] = [];
  const wbsToId = new Map<string, string>();

  for (const r of dataRows) {
    const wbs = (r[offset + 0] ?? '').trim();
    const name = (r[offset + 1] ?? '').trim() || '無題タスク';
    const duration = Math.max(0, Math.round(Number(r[offset + 2]) || 0));
    const startDate = (r[offset + 3] ?? '').trim();
    const endDate = (r[offset + 4] ?? '').trim() || startDate;
    const progress = Math.max(0, Math.min(100, Math.round(Number(r[offset + 5]) || 0)));
    const assignee = (r[offset + 6] ?? '').trim();
    const notes = (r[offset + 8] ?? '').trim();

    const id = generateId();
    if (wbs) wbsToId.set(wbs, id);

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

  // 2パス目: WBS から親を決定する
  dataRows.forEach((r, i) => {
    const task = tasks[i];
    const wbs = (r[offset + 0] ?? '').trim();
    if (wbs) {
      const pWbs = parentWbs(wbs);
      if (pWbs && wbsToId.has(pWbs)) {
        task.parentId = wbsToId.get(pWbs)!;
      }
    }
  });

  // WBSから親を設定した後、改めて WBS マップを再構築する（これで正しい親子階層関係に基づいたWBSが得られる）
  const wbsMap = getWbsMap(tasks);

  // 3パス目: 先行列から依存を復元
  dataRows.forEach((r, i) => {
    const task = tasks[i];
    const depStr = (r[offset + 7] ?? '').trim();
    if (depStr) {
      const { tokens } = parseDepsInput(depStr, tasks, wbsMap);
      const deps = tokens
        .filter(tok => tok.id !== task.id) // 自己参照を除外
        .map(tok => toStorage({ id: tok.id, type: tok.type, lag: tok.lag }));
      if (deps.length > 0) task.dependencies = deps;
    }
  });

  return tasks;
}
