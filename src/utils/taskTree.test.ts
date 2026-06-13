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
  getFilteredVisibleTasks,
  taskMatchesQuery,
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

describe('taskMatchesQuery', () => {
  it('matches by name (case-insensitive)', () => {
    expect(taskMatchesQuery(makeTask({ id: 'x', name: '設計レビュー' }), 'レビュー')).toBe(true);
    expect(taskMatchesQuery(makeTask({ id: 'x', name: 'Design' }), 'design')).toBe(true);
  });

  it('matches by assignee and notes', () => {
    expect(taskMatchesQuery(makeTask({ id: 'x', assignee: '田中' }), '田中')).toBe(true);
    expect(taskMatchesQuery(makeTask({ id: 'x', notes: '要確認' }), '確認')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(taskMatchesQuery(makeTask({ id: 'x', name: 'A' }), 'zzz')).toBe(false);
  });
});

describe('getFilteredVisibleTasks', () => {
  const searchTasks: Task[] = [
    makeTask({ id: '1', name: '親' }),
    makeTask({ id: '2', name: '設計', parentId: '1' }),
    makeTask({ id: '3', name: '実装', parentId: '1' }),
    makeTask({ id: '4', name: '別ルート' }),
  ];

  it('空クエリでは getVisibleTasks と同じ', () => {
    expect(getFilteredVisibleTasks(searchTasks, '').map(t => t.id))
      .toEqual(getVisibleTasks(searchTasks).map(t => t.id));
  });

  it('一致タスクと祖先を返す', () => {
    const ids = getFilteredVisibleTasks(searchTasks, '設計').map(t => t.id);
    expect(ids).toContain('2'); // 一致
    expect(ids).toContain('1'); // 祖先
    expect(ids).not.toContain('3');
    expect(ids).not.toContain('4');
  });

  it('折りたたまれていても一致タスクを表示する', () => {
    const collapsed = searchTasks.map(t => t.id === '1' ? { ...t, collapsed: true } : t);
    const ids = getFilteredVisibleTasks(collapsed, '実装').map(t => t.id);
    expect(ids).toContain('3');
    expect(ids).toContain('1');
  });

  it('一致なしなら空配列', () => {
    expect(getFilteredVisibleTasks(searchTasks, 'zzz')).toHaveLength(0);
  });
});

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

  it('allows redundant paths that do not form a cycle', () => {
    const testTasks: Task[] = [
      makeTask({ id: '1', dependencies: [] }),
      makeTask({ id: '2', dependencies: ['1'] }),
      makeTask({ id: '3', dependencies: ['2'] }),
    ];
    // 1 -> 2 -> 3 already exists; adding 1 -> 3 is a diamond, not a cycle
    expect(checkCircularDependency('3', '1', testTasks)).toBe(false);
  });

  it('terminates when existing data already contains a cycle', () => {
    const testTasks: Task[] = [
      makeTask({ id: '1', dependencies: ['2'] }),
      makeTask({ id: '2', dependencies: ['1'] }),
      makeTask({ id: '3', dependencies: [] }),
    ];
    expect(checkCircularDependency('3', '1', testTasks)).toBe(false);
    expect(checkCircularDependency('1', '2', testTasks)).toBe(true);
  });
});
