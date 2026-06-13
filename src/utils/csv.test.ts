import { describe, it, expect } from 'vitest';
import { exportTasksToCSV, parseTasksFromCSV, parseCSV } from './csv';
import type { Project, Task } from '../types';

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    name: overrides.id,
    startDate: '2026-06-08',
    endDate: '2026-06-12',
    duration: 4,
    parentId: null,
    isMilestone: false,
    progress: 0,
    collapsed: false,
    assignee: '',
    ...overrides,
  };
}

function makeProject(tasks: Task[]): Project {
  return {
    name: 'Test',
    calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [] },
    tasks,
  };
}

describe('parseCSV', () => {
  it('引用符内のカンマ・改行・二重引用符を扱う', () => {
    const text = 'a,"b,c","d""e"\n1,"2\n3",4';
    const rows = parseCSV(text);
    expect(rows[0]).toEqual(['a', 'b,c', 'd"e']);
    expect(rows[1]).toEqual(['1', '2\n3', '4']);
  });

  it('先頭の BOM を除去する', () => {
    const rows = parseCSV('﻿a,b');
    expect(rows[0]).toEqual(['a', 'b']);
  });
});

describe('exportTasksToCSV', () => {
  it('BOM 付きでヘッダー行を含む', () => {
    const csv = exportTasksToCSV(makeProject([makeTask({ id: '1', name: 'A' })]));
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('行番号,WBS,タスク名,期間,開始日,終了日,進捗,担当者,先行,メモ');
  });

  it('カンマを含む名前をクオートする', () => {
    const csv = exportTasksToCSV(makeProject([makeTask({ id: '1', name: 'A,B' })]));
    expect(csv).toContain('"A,B"');
  });
});

describe('CSV round-trip', () => {
  it('階層と依存を復元する', () => {
    const project = makeProject([
      makeTask({ id: 'p', name: '親', startDate: '2026-06-08', endDate: '2026-06-12', duration: 4 }),
      makeTask({ id: 'a', name: '子A', parentId: 'p', startDate: '2026-06-08', endDate: '2026-06-10', duration: 2 }),
      makeTask({ id: 'b', name: '子B', parentId: 'p', startDate: '2026-06-10', endDate: '2026-06-12', duration: 2, dependencies: ['a'] }),
    ]);
    const csv = exportTasksToCSV(project);
    const tasks = parseTasksFromCSV(csv);

    expect(tasks).toHaveLength(3);
    const [p, a, b] = tasks;
    expect(p.name).toBe('親');
    expect(a.parentId).toBe(p.id); // 階層復元
    expect(b.parentId).toBe(p.id);
    // 依存（b は a に依存）を行番号経由で復元
    expect(b.dependencies).toEqual([a.id]);
  });

  it('依存タイプとラグを保持する', () => {
    const project = makeProject([
      makeTask({ id: 'a', name: 'A', startDate: '2026-06-08', endDate: '2026-06-12', duration: 4 }),
      makeTask({ id: 'b', name: 'B', startDate: '2026-06-15', endDate: '2026-06-17', duration: 2, dependencies: [{ id: 'a', type: 'SS', lag: 2 }] }),
    ]);
    const csv = exportTasksToCSV(project);
    const tasks = parseTasksFromCSV(csv);
    expect(tasks[1].dependencies).toEqual([{ id: tasks[0].id, type: 'SS', lag: 2 }]);
  });

  it('メモ内の改行を保持する', () => {
    const project = makeProject([makeTask({ id: '1', name: 'A', notes: '行1\n行2' })]);
    const csv = exportTasksToCSV(project);
    const tasks = parseTasksFromCSV(csv);
    expect(tasks[0].notes).toBe('行1\n行2');
  });

  it('期間0はマイルストーンとして復元する', () => {
    const project = makeProject([makeTask({ id: 'm', name: 'M', duration: 0, isMilestone: true, endDate: '2026-06-08' })]);
    const tasks = parseTasksFromCSV(exportTasksToCSV(project));
    expect(tasks[0].isMilestone).toBe(true);
    expect(tasks[0].duration).toBe(0);
  });
});

describe('parseTasksFromCSV edge cases', () => {
  it('空文字は空配列を返す', () => {
    expect(parseTasksFromCSV('')).toHaveLength(0);
  });

  it('ヘッダーのみは空配列を返す', () => {
    const csv = exportTasksToCSV(makeProject([]));
    expect(parseTasksFromCSV(csv)).toHaveLength(0);
  });
});
