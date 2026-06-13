import type { Task } from '../types';
import { depRefs } from './deps';

export function getChildren(parentId: string, tasks: Task[]): Task[] {
  return tasks.filter(t => t.parentId === parentId);
}

export function getDescendants(parentId: string, tasks: Task[]): Task[] {
  const result: Task[] = [];
  const children = getChildren(parentId, tasks);
  for (const child of children) {
    result.push(child);
    result.push(...getDescendants(child.id, tasks));
  }
  return result;
}

export function getSiblings(taskId: string, tasks: Task[]): Task[] {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return [];
  return tasks.filter(t => t.parentId === task.parentId && t.id !== taskId);
}

export function getPreviousSibling(taskId: string, tasks: Task[]): Task | null {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;
  const sameParent = tasks.filter(t => t.parentId === task.parentId);
  const idx = sameParent.findIndex(t => t.id === taskId);
  return idx > 0 ? sameParent[idx - 1] : null;
}

export function getNextSibling(taskId: string, tasks: Task[]): Task | null {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;
  const sameParent = tasks.filter(t => t.parentId === task.parentId);
  const idx = sameParent.findIndex(t => t.id === taskId);
  return idx < sameParent.length - 1 ? sameParent[idx + 1] : null;
}

export function getDepth(taskId: string, tasks: Task[]): number {
  let depth = 0;
  let current = tasks.find(t => t.id === taskId);
  while (current?.parentId) {
    depth++;
    current = tasks.find(t => t.id === current!.parentId);
  }
  return depth;
}

export function getMaxDepth(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  return tasks.reduce((max, t) => Math.max(max, getDepth(t.id, tasks) + 1), 0);
}

export function getVisibleTasks(tasks: Task[]): Task[] {
  const result: Task[] = [];
  const rootTasks = tasks.filter(t => t.parentId === null);

  function walk(taskList: Task[]) {
    for (const task of taskList) {
      result.push(task);
      if (!task.collapsed) {
        walk(getChildren(task.id, tasks));
      }
    }
  }

  walk(rootTasks);
  return result;
}

/** タスク名・担当者・メモのいずれかに query（大文字小文字無視）を含むか */
export function taskMatchesQuery(task: Task, query: string): boolean {
  const q = query.toLowerCase();
  return (
    task.name.toLowerCase().includes(q) ||
    (task.assignee ?? '').toLowerCase().includes(q) ||
    (task.notes ?? '').toLowerCase().includes(q)
  );
}

/**
 * query に一致するタスクとその祖先のみをツリー順で返す。
 * 一致タスクを常に見えるようにするため collapsed は無視する。
 * query が空なら通常の getVisibleTasks と同じ。
 */
export function getFilteredVisibleTasks(tasks: Task[], query: string): Task[] {
  const trimmed = query.trim();
  if (!trimmed) return getVisibleTasks(tasks);

  const byId = new Map(tasks.map(t => [t.id, t]));
  const keep = new Set<string>();
  for (const t of tasks) {
    if (taskMatchesQuery(t, trimmed)) {
      keep.add(t.id);
      let pid = t.parentId;
      while (pid && !keep.has(pid)) {
        keep.add(pid);
        pid = byId.get(pid)?.parentId ?? null;
      }
    }
  }

  const result: Task[] = [];
  function walk(list: Task[]) {
    for (const t of list) {
      if (keep.has(t.id)) {
        result.push(t);
        walk(getChildren(t.id, tasks));
      }
    }
  }
  walk(tasks.filter(t => t.parentId === null));
  return result;
}

export function getFlattenedTasks(tasks: Task[]): Task[] {
  const result: Task[] = [];
  const rootTasks = tasks.filter(t => t.parentId === null);

  function walk(taskList: Task[]) {
    for (const task of taskList) {
      result.push(task);
      walk(getChildren(task.id, tasks));
    }
  }

  walk(rootTasks);
  return result;
}

/** タスクID → WBS番号（"1.2.3" 形式）。ルート・兄弟とも配列順で採番する。 */
export function getWbsMap(tasks: Task[]): Map<string, string> {
  const map = new Map<string, string>();

  function walk(list: Task[], prefix: string) {
    list.forEach((t, i) => {
      const wbs = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      map.set(t.id, wbs);
      walk(getChildren(t.id, tasks), wbs);
    });
  }

  walk(tasks.filter(t => t.parentId === null), '');
  return map;
}

export function canIndent(taskId: string, tasks: Task[]): boolean {
  return getPreviousSibling(taskId, tasks) !== null;
}

export function canOutdent(taskId: string, tasks: Task[]): boolean {
  const task = tasks.find(t => t.id === taskId);
  return task !== undefined && task.parentId !== null;
}

/**
 * targetId のタスクに potentialPredecessorId を先行タスクとして追加したとき、
 * 循環依存が発生するかを返す（= potentialPredecessorId が targetId に
 * 推移的に依存しているか）。
 */
export function checkCircularDependency(targetId: string, potentialPredecessorId: string, tasks: Task[]): boolean {
  const visited = new Set<string>();

  function dependsOnTarget(taskId: string): boolean {
    if (visited.has(taskId)) return false;
    visited.add(taskId);
    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;
    const refs = depRefs(task);
    if (refs.some(r => r.id === targetId)) return true;
    return refs.some(r => dependsOnTarget(r.id));
  }

  return dependsOnTarget(potentialPredecessorId);
}
