import type { Task } from '../types';

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
    if (!task || !task.dependencies) return false;
    if (task.dependencies.includes(targetId)) return true;
    return task.dependencies.some(dId => dependsOnTarget(dId));
  }

  return dependsOnTarget(potentialPredecessorId);
}
