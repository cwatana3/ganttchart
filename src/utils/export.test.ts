import { describe, it, expect, vi, beforeAll } from 'vitest';
import { validateProject, buildGanttSvg } from './export';
import type { Project, Task } from '../types';
import { format, addDays } from 'date-fns';

beforeAll(() => {
  // jsdom has no canvas 2D; silence its "not implemented" error so
  // textWidth falls back to the approximation quietly
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    name: overrides.id,
    startDate: '2026-06-08',
    endDate: '2026-06-12',
    duration: 5,
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
    name: 'Test Project',
    calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [] },
    tasks,
  };
}

describe('validateProject', () => {
  const validProject: Project = {
    name: 'Test Project',
    calendar: {
      workingDays: [1, 2, 3, 4, 5],
      holidays: ['2026-06-15'],
    },
    tasks: [
      {
        id: '1',
        name: 'Task 1',
        startDate: '2026-06-08',
        endDate: '2026-06-12',
        duration: 5,
        parentId: null,
        isMilestone: false,
        progress: 0,
        collapsed: false,
        assignee: 'Alice',
        dependencies: [],
      },
    ],
  };

  it('returns true for a valid project object', () => {
    expect(validateProject(validProject)).toBe(true);
  });

  it('returns false for missing properties', () => {
    const invalid = { ...validProject };
    delete (invalid as any).name;
    expect(validateProject(invalid)).toBe(false);
  });

  it('returns false for invalid calendar type', () => {
    const invalid = {
      ...validProject,
      calendar: {
        workingDays: 'not-an-array' as any,
        holidays: [],
      },
    };
    expect(validateProject(invalid)).toBe(false);
  });

  it('returns false for invalid tasks properties', () => {
    const invalid = {
      ...validProject,
      tasks: [
        {
          id: '1',
          name: 'Task 1',
          startDate: '2026-06-08',
          // missing endDate
          duration: 5,
          parentId: null,
          isMilestone: false,
          progress: 0,
          collapsed: false,
        } as any,
      ],
    };
    expect(validateProject(invalid)).toBe(false);
  });

  it('returns false for duplicate task ids', () => {
    const project = makeProject([makeTask({ id: '1' }), makeTask({ id: '1' })]);
    expect(validateProject(project)).toBe(false);
  });

  it('returns false when parentId references a missing task', () => {
    const project = makeProject([makeTask({ id: '1', parentId: 'nope' })]);
    expect(validateProject(project)).toBe(false);
  });

  it('returns false for circular parent references', () => {
    const project = makeProject([
      makeTask({ id: '1', parentId: '2' }),
      makeTask({ id: '2', parentId: '1' }),
    ]);
    expect(validateProject(project)).toBe(false);
  });

  it('accepts a valid multi-level hierarchy', () => {
    const project = makeProject([
      makeTask({ id: '1' }),
      makeTask({ id: '2', parentId: '1' }),
      makeTask({ id: '3', parentId: '2' }),
    ]);
    expect(validateProject(project)).toBe(true);
  });
});

describe('buildGanttSvg', () => {
  const d = (offset: number) => format(addDays(new Date(), offset), 'yyyy-MM-dd');

  function sampleProject(): Project {
    return makeProject([
      makeTask({ id: 'p', name: '親タスク', startDate: d(0), endDate: d(7), duration: 6 }),
      makeTask({ id: 'a', name: '子タスクA', parentId: 'p', startDate: d(0), endDate: d(3), duration: 3 }),
      makeTask({ id: 'b', name: '子タスクB', parentId: 'p', startDate: d(4), endDate: d(7), duration: 3, dependencies: ['a', 'm'] }),
      makeTask({ id: 'm', name: 'リリース', isMilestone: true, startDate: d(10), endDate: d(10), duration: 0 }),
    ]);
  }

  it('renders all ten table column headers', () => {
    const svg = buildGanttSvg(sampleProject(), false);
    const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
    for (const label of ['#', 'WBS', 'タスク名', '期間', '開始日', '終了日', '進捗', '担当者', '先行', 'メモ']) {
      expect(texts).toContain(label);
    }
  });

  it('renders task bars, summary bracket, milestone and dependency lines', () => {
    const svg = buildGanttSvg(sampleProject(), false);
    expect(svg.querySelectorAll('rect[fill="url(#task-gradient)"]')).toHaveLength(2);
    expect(svg.querySelectorAll('path[fill="url(#summary-gradient)"]')).toHaveLength(1);
    // chart diamond + table name-column icon
    expect(svg.querySelectorAll('polygon[fill="url(#milestone-gradient)"]')).toHaveLength(2);
    expect(svg.querySelectorAll('polyline[marker-end]')).toHaveLength(2);
  });

  it('shows predecessor row numbers in the 先行 column', () => {
    const svg = buildGanttSvg(sampleProject(), false);
    const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
    expect(texts).toContain('2, 4');
  });

  it('omits children of a collapsed parent', () => {
    const project = sampleProject();
    project.tasks[0].collapsed = true;
    const svg = buildGanttSvg(project, false);
    expect(svg.querySelectorAll('rect[fill="url(#task-gradient)"]')).toHaveLength(0);
    const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
    expect(texts).not.toContain('子タスクA');
  });

  it('uses the light or dark background', () => {
    const dark = buildGanttSvg(sampleProject(), false);
    const light = buildGanttSvg(sampleProject(), true);
    expect(dark.querySelector('rect')?.getAttribute('fill')).toBe('#1e1e1e');
    expect(light.querySelector('rect')?.getAttribute('fill')).toBe('#ffffff');
  });

  it('truncates names that exceed the column width', () => {
    const project = makeProject([
      makeTask({ id: '1', name: 'あ'.repeat(100), startDate: d(0), endDate: d(3), duration: 3 }),
    ]);
    const svg = buildGanttSvg(project, false);
    const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent ?? '');
    expect(texts.some(t => t.endsWith('…'))).toBe(true);
  });

  it('renders an empty project without throwing', () => {
    const svg = buildGanttSvg(makeProject([]), true);
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(svg.getAttribute('height'))).toBeGreaterThan(0);
  });

  it.each(['day', 'week', 'month'] as const)('renders in %s view mode', (mode) => {
    const svg = buildGanttSvg(sampleProject(), false, mode);
    expect(svg.querySelectorAll('rect[fill="url(#task-gradient)"]')).toHaveLength(2);
  });

  function chainProject(): Project {
    return makeProject([
      makeTask({ id: 'a', name: 'A', startDate: '2026-06-08', endDate: '2026-06-10', duration: 2 }),
      makeTask({ id: 'b', name: 'B', startDate: '2026-06-10', endDate: '2026-06-12', duration: 2, dependencies: ['a'] }),
    ]);
  }

  it('highlights critical-path bars when enabled', () => {
    const svg = buildGanttSvg(chainProject(), false, 'day', true);
    const reds = Array.from(svg.querySelectorAll('[stroke="#e11d48"]'));
    expect(reds.length).toBeGreaterThan(0);
  });

  it('does not highlight critical path when disabled', () => {
    const svg = buildGanttSvg(chainProject(), false, 'day', false);
    expect(svg.querySelectorAll('[stroke="#e11d48"]')).toHaveLength(0);
  });

  it('renders baseline bars when a baseline is recorded', () => {
    const project = makeProject([
      makeTask({ id: 'a', name: 'A', startDate: '2026-06-10', endDate: '2026-06-12', duration: 2 }),
    ]);
    project.baseline = { a: { startDate: '2026-06-08', endDate: '2026-06-10' } };
    const svg = buildGanttSvg(project, false, 'day');
    expect(svg.querySelectorAll('rect[fill="#94a3b8"]').length).toBeGreaterThan(0);
  });

  it('renders no baseline bars without a baseline', () => {
    const project = makeProject([
      makeTask({ id: 'a', name: 'A', startDate: '2026-06-10', endDate: '2026-06-12', duration: 2 }),
    ]);
    const svg = buildGanttSvg(project, false, 'day');
    expect(svg.querySelectorAll('rect[fill="#94a3b8"]')).toHaveLength(0);
  });

  it('limits the timeline width to an explicit date range', () => {
    const project = makeProject([
      makeTask({ id: 'a', name: 'A', startDate: '2026-06-01', endDate: '2026-08-31', duration: 60 }),
    ]);
    const full = buildGanttSvg(project, false, 'day');
    const ranged = buildGanttSvg(project, false, 'day', false, { start: '2026-06-10', end: '2026-06-20' });
    expect(Number(ranged.getAttribute('width'))).toBeLessThan(Number(full.getAttribute('width')));
  });
});
