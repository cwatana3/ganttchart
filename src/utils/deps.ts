import type { Task, TaskDependency, DependencyRef, DepType } from '../types';

/** 文字列形式（後方互換）を正規形 { id, type: 'FS', lag: 0 } に変換する */
export function toDepRef(dep: TaskDependency): DependencyRef {
  return typeof dep === 'string' ? { id: dep, type: 'FS', lag: 0 } : dep;
}

export function depRefs(task: Task): DependencyRef[] {
  return (task.dependencies ?? []).map(toDepRef);
}

export function depIds(task: Task): string[] {
  return depRefs(task).map(d => d.id);
}

/** FS・ラグ0 は文字列に落として保存形式を最小化する */
export function toStorage(ref: DependencyRef): TaskDependency {
  return ref.type === 'FS' && ref.lag === 0 ? ref.id : ref;
}

/** 「3」「3SS」「3FS+2」「3-1」または「1.1」「1.1SS」などの形式。 */
export function formatDepRef(ref: DependencyRef, tasks: Task[], wbsMap?: Map<string, string>): string {
  const wbs = wbsMap?.get(ref.id);
  if (wbs) {
    let s = wbs;
    if (ref.type !== 'FS') s += ref.type;
    if (ref.lag !== 0) s += ref.lag > 0 ? `+${ref.lag}` : String(ref.lag);
    return s;
  }
  const idx = tasks.findIndex(t => t.id === ref.id);
  if (idx === -1) return '';
  let s = String(idx + 1);
  if (ref.type !== 'FS') s += ref.type;
  if (ref.lag !== 0) s += ref.lag > 0 ? `+${ref.lag}` : String(ref.lag);
  return s;
}

export function formatDeps(task: Task, tasks: Task[], wbsMap?: Map<string, string>): string {
  return depRefs(task)
    .map(r => formatDepRef(r, tasks, wbsMap))
    .filter(Boolean)
    .join(', ');
}

const DEP_INPUT_RE = /^([\d.]+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?$/i;

export interface ParsedDepToken {
  id: string;
  type: DepType;
  lag: number;
}

/**
 * 先行列の入力（カンマ区切り）を解析する。
 * WBSコード（例: "1.1"）または行番号（例: "3"）のどちらからでもタスクを特定できる。
 * invalid には解析不能または一致するタスクがないトークンが入る。
 */
export function parseDepsInput(
  input: string,
  tasks: Task[],
  wbsMap?: Map<string, string>
): { tokens: ParsedDepToken[]; invalid: string[] } {
  const tokens: ParsedDepToken[] = [];
  const invalid: string[] = [];

  const wbsToId = new Map<string, string>();
  if (wbsMap) {
    for (const [id, wbs] of wbsMap.entries()) {
      wbsToId.set(wbs, id);
    }
  }

  for (const token of input.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = token.match(DEP_INPUT_RE);
    if (!m) {
      invalid.push(token);
      continue;
    }
    const refStr = m[1]; // "1.1" または "3" など
    const type = (m[2]?.toUpperCase() ?? 'FS') as DepType;
    const lag = m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0;

    let targetId: string | undefined;

    // 1. WBSコードで検索
    if (wbsToId.has(refStr)) {
      targetId = wbsToId.get(refStr);
    } else {
      // 2. 行番号（1始まり）で検索
      const rowIdx = parseInt(refStr, 10);
      if (!isNaN(rowIdx) && rowIdx >= 1 && rowIdx <= tasks.length) {
        targetId = tasks[rowIdx - 1].id;
      }
    }

    if (!targetId) {
      invalid.push(token);
      continue;
    }

    tokens.push({ id: targetId, type, lag });
  }
  return { tokens, invalid };
}
