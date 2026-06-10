import { describe, it, expect } from 'vitest';
import {
  getChildren,
  getDescendants,
  getSiblings,
  getPreviousSibling,
  getNextSibling,
  getMaxDepth,
  getVisibleTasks,
  getFlattenedTasks,
  canIndent,
  canOutdent,
  checkCircularDependency,
} from './taskTree';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    name: overrides.id,
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    duration: 5,
    parentId: null,
    isMilestone: false,
    progress: 0,
    collapsed: false,
    assignee: '',
    ...overrides,
  };
}

const tasks: Task[] = [
  makeTask({ id: '1' }),
  makeTask({ id: '2', parentId: '1' }),
  makeTask({ id: '3', parentId: '1' }),
  makeTask({ id: '4', parentId: '2' }),
  makeTask({ id: '5' }),
];

describe('getChildren', () => {
  it('returns direct children', () => {
    const children = getChildren('1', tasks);
    expect(children.map(t => t.id)).toEqual(['2', '3']);
  });

  it('returns empty array for leaf task', () => {
    expect(getChildren('5', tasks)).toHaveLength(0);
  });
});

describe('getDescendants', () => {
  it('returns all descendants', () => {
    const desc = getDescendants('1', tasks);
    expect(desc.map(t => t.id).sort()).toEqual(['2', '3', '4']);
  });
});

describe('getSiblings', () => {
  it('returns siblings excluding self', () => {
    const sibs = getSiblings('2', tasks);
    expect(sibs.map(t => t.id)).toEqual(['3']);
  });
});

describe('getPreviousSibling', () => {
  it('returns previous sibling', () => {
    expect(getPreviousSibling('3', tasks)?.id).toBe('2');
  });

  it('returns null for first child', () => {
    expect(getPreviousSibling('2', tasks)).toBeNull();
  });
});

describe('getNextSibling', () => {
  it('returns next sibling', () => {
    expect(getNextSibling('2', tasks)?.id).toBe('3');
  });

  it('returns null for last child', () => {
    expect(getNextSibling('3', tasks)).toBeNull();
  });
});

describe('getMaxDepth', () => {
  it('returns max nesting depth', () => {
    expect(getMaxDepth(tasks)).toBe(3);
  });
});

describe('getVisibleTasks', () => {
  it('shows all tasks when nothing collapsed', () => {
    expect(getVisibleTasks(tasks).length).toBe(5);
  });

  it('hides children when parent collapsed', () => {
    const withCollapsed = tasks.map(t =>
      t.id === '1' ? { ...t, collapsed: true } : t
    );
    const visible = getVisibleTasks(withCollapsed);
    expect(visible.map(t => t.id)).toEqual(['1', '5']);
  });
});

describe('getFlattenedTasks', () => {
  it('returns tasks in depth-first order', () => {
    const flat = getFlattenedTasks(tasks);
    expect(flat.map(t => t.id)).toEqual(['1', '2', '4', '3', '5']);
  });
});

describe('canIndent', () => {
  it('allows indent under previous sibling', () => {
    expect(canIndent('3', tasks)).toBe(true);
  });

  it('disallows indent for first child', () => {
    expect(canIndent('2', tasks)).toBe(false);
  });
});

describe('canOutdent', () => {
  it('allows outdent for child task', () => {
    expect(canOutdent('2', tasks)).toBe(true);
  });

  it('disallows outdent for root task', () => {
    expect(canOutdent('1', tasks)).toBe(false);
  });
});

describe('checkCircularDependency', () => {
  it('detects direct circular dependency', () => {
    const testTasks: Task[] = [
      makeTask({ id: '1', dependencies: ['2'] }),
      makeTask({ id: '2', dependencies: [] }),
    ];
    // Making 2 depend on 1 would create 1 -> 2 -> 1
    expect(checkCircularDependency('2', '1', testTasks)).toBe(true);
    // Making 1 depend on 2 is fine
    expect(checkCircularDependency('1', '2', testTasks)).toBe(false);
  });

  it('detects indirect circular dependency', () => {
    const testTasks: Task[] = [
      makeTask({ id: '1', dependencies: ['2'] }),
      makeTask({ id: '2', dependencies: ['3'] }),
      makeTask({ id: '3', dependencies: [] }),
    ];
    // Making 3 depend on 1 would create 1 -> 2 -> 3 -> 1
    expect(checkCircularDependency('3', '1', testTasks)).toBe(true);
  });
});
