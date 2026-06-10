import { describe, it, expect } from 'vitest';
import { validateProject } from './export';
import type { Project } from '../types';

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
});
