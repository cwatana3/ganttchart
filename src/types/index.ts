export interface Calendar {
  workingDays: number[];
  holidays: string[];
}

export interface Task {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  duration: number;
  parentId: string | null;
  isMilestone: boolean;
  progress: number;
  collapsed: boolean;
  assignee: string;
  dependencies?: string[];
}

export interface Project {
  name: string;
  calendar: Calendar;
  tasks: Task[];
}

export type ProjectAction =
  | { type: 'LOAD_PROJECT'; project: Project }
  | { type: 'SET_PROJECT_NAME'; name: string }
  | { type: 'SET_CALENDAR'; calendar: Calendar }
  | { type: 'ADD_TASK'; parentId: string | null; afterId?: string }
  | { type: 'DELETE_TASK'; id: string }
  | { type: 'DELETE_TASKS'; ids: string[] }
  | { type: 'UPDATE_TASK'; id: string; changes: Partial<Task> }
  | { type: 'INDENT_TASK'; id: string }
  | { type: 'OUTDENT_TASK'; id: string }
  | { type: 'MOVE_TASK'; id: string; direction: 'up' | 'down' }
  | { type: 'REORDER_TASK'; id: string; targetId: string; position: 'before' | 'after' | 'inside' }
  | { type: 'REORDER_TASKS'; ids: string[]; targetId: string; position: 'before' | 'after' | 'inside' }
  | { type: 'SHIFT_TASKS'; ids: string[]; dayOffset: number }
  | { type: 'PASTE_TASKS'; tasksToInsert: Task[]; afterId: string | null }
  | { type: 'TOGGLE_COLLAPSE'; id: string };

export function createDefaultCalendar(): Calendar {
  return {
    workingDays: [1, 2, 3, 4, 5],
    holidays: [],
  };
}

export function createDefaultProject(): Project {
  return {
    name: '新規プロジェクト',
    calendar: createDefaultCalendar(),
    tasks: [],
  };
}
