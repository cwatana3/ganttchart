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

/** 「3」「3SS」「3FS+2」「3-1」形式。行番号は tasks 配列の 1 始まり */
export function formatDepRef(ref: DependencyRef, tasks: Task[]): string {
  const idx = tasks.findIndex(t => t.id === ref.id);
  if (idx === -1) return '';
  let s = String(idx + 1);
  if (ref.type !== 'FS') s += ref.type;
  if (ref.lag !== 0) s += ref.lag > 0 ? `+${ref.lag}` : String(ref.lag);
  return s;
}

export function formatDeps(task: Task, tasks: Task[]): string {
  return depRefs(task)
    .map(r => formatDepRef(r, tasks))
    .filter(Boolean)
    .join(', ');
}

const DEP_INPUT_RE = /^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?$/i;

export interface ParsedDepToken {
  row: number;
  type: DepType;
  lag: number;
}

/**
 * 先行列の入力（カンマ区切り）を解析する。
 * invalid には解析不能または行番号が範囲外のトークンが入る。
 */
export function parseDepsInput(input: string, taskCount: number): { tokens: ParsedDepToken[]; invalid: string[] } {
  const tokens: ParsedDepToken[] = [];
  const invalid: string[] = [];
  for (const token of input.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = token.match(DEP_INPUT_RE);
    if (!m) {
      invalid.push(token);
      continue;
    }
    const row = parseInt(m[1], 10);
    if (row < 1 || row > taskCount) {
      invalid.push(token);
      continue;
    }
    const type = (m[2]?.toUpperCase() ?? 'FS') as DepType;
    const lag = m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0;
    tokens.push({ row, type, lag });
  }
  return { tokens, invalid };
}
