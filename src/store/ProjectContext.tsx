import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { Project, ProjectAction, Task } from '../types';
import { createDefaultProject } from '../types';
import {
  getFlattenedTasks,
  getChildren,
  getPreviousSibling,
  canIndent,
  canOutdent,
} from '../utils/taskTree';
import { addWorkingDays, fromDate } from '../utils/calendar';

function generateId(): string {
  return crypto.randomUUID();
}

const STORE_NAME = 'gannt-project';
const DB_NAME = 'gannt-db';

async function saveToIndexedDB(project: Project): Promise<void> {
  const { openDB } = await import('idb');
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('projects');
    },
  });
  await db.put('projects', project, STORE_NAME);
  db.close();
}

async function loadFromIndexedDB(): Promise<Project | null> {
  try {
    const { openDB } = await import('idb');
    const db = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('projects');
      },
    });
    const project = await db.get('projects', STORE_NAME);
    db.close();
    return project ?? null;
  } catch {
    return null;
  }
}

function projectReducer(state: Project, action: ProjectAction): Project {
  switch (action.type) {
    case 'LOAD_PROJECT':
      return action.project;

    case 'SET_PROJECT_NAME':
      return { ...state, name: action.name };

    case 'SET_CALENDAR':
      return { ...state, calendar: action.calendar };

    case 'ADD_TASK': {
      const newTask: Task = {
        id: generateId(),
        name: '新規タスク',
        startDate: fromDate(new Date()),
        endDate: fromDate(new Date()),
        duration: 1,
        parentId: action.parentId,
        isMilestone: false,
        progress: 0,
        collapsed: false,
        assignee: '',
      };
      newTask.endDate = addWorkingDays(newTask.startDate, 1, state.calendar);
      newTask.duration = 1;

      const tasks = [...state.tasks];

      if (action.afterId) {
        // afterId のタスクの直後に追加
        const flat = getFlattenedTasks(tasks);
        const afterIdx = flat.findIndex(t => t.id === action.afterId);
        if (afterIdx >= 0) {
          const targetTask = flat[afterIdx];
          const descendants = getDescendants(targetTask.id, tasks);
          const lastDescId = descendants.length > 0 ? descendants[descendants.length - 1].id : targetTask.id;
          const insertPos = tasks.findIndex(t => t.id === lastDescId);
          
          // 同じ親の次の兄弟がいる場合、その手前
          const siblings = tasks.filter(t => t.parentId === action.parentId);
          const afterSibIdx = siblings.findIndex(t => t.id === action.afterId);
          if (afterSibIdx < siblings.length - 1) {
            const nextSib = siblings[afterSibIdx + 1];
            const insertPos = tasks.findIndex(t => t.id === nextSib.id);
            tasks.splice(insertPos, 0, newTask);
          } else {
            // 最後の兄弟の場合、全タスクの最後
            tasks.splice(insertPos + 1, 0, newTask);
          }
        }
      } else {
        // 親の最後に追加
        if (action.parentId) {
          const children = getChildren(action.parentId, tasks);
          if (children.length > 0) {
            const lastChild = children[children.length - 1];
            const lastDescIdx = findLastIndex(tasks, lastChild.id);
            tasks.splice(lastDescIdx + 1, 0, newTask);
          } else {
            const parentIdx = tasks.findIndex(t => t.id === action.parentId);
            tasks.splice(parentIdx + 1, 0, newTask);
          }
        } else {
          tasks.push(newTask);
        }
      }

      return { ...state, tasks };
    }

    case 'DELETE_TASK': {
      const idsToDelete = new Set<string>([action.id]);
      function collectChildren(parentId: string) {
        for (const child of getChildren(parentId, state.tasks)) {
          idsToDelete.add(child.id);
          collectChildren(child.id);
        }
      }
      collectChildren(action.id);
      return { ...state, tasks: state.tasks.filter(t => !idsToDelete.has(t.id)) };
    }

    case 'UPDATE_TASK': {
      const tasks = state.tasks.map(t => {
        if (t.id !== action.id) return t;
        const updated = { ...t, ...action.changes };

        if (updated.isMilestone) {
          updated.duration = 0;
          updated.endDate = updated.startDate;
        } else if (action.changes.duration !== undefined && !action.changes.endDate) {
          updated.endDate = addWorkingDays(updated.startDate, updated.duration, state.calendar);
        } else if (action.changes.startDate !== undefined && !action.changes.endDate) {
          updated.endDate = addWorkingDays(updated.startDate, updated.duration, state.calendar);
        }

        return updated;
      });
      return { ...state, tasks };
    }

    case 'INDENT_TASK': {
      if (!canIndent(action.id, state.tasks)) return state;
      const prevSibling = getPreviousSibling(action.id, state.tasks);
      if (!prevSibling) return state;
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === action.id ? { ...t, parentId: prevSibling.id } : t
        ),
      };
    }

    case 'OUTDENT_TASK': {
      if (!canOutdent(action.id, state.tasks)) return state;
      const task = state.tasks.find(t => t.id === action.id)!;
      const parent = state.tasks.find(t => t.id === task.parentId)!;
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === action.id ? { ...t, parentId: parent.parentId } : t
        ),
      };
    }

    case 'MOVE_TASK': {
      const flat = getFlattenedTasks(state.tasks);
      const idx = flat.findIndex(t => t.id === action.id);
      if (idx < 0) return state;

      const targetIdx = action.direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= flat.length) return state;

      const targetId = flat[targetIdx].id;
      const newTasks = moveTaskBlock(state.tasks, action.id, targetId, action.direction === 'up' ? 'before' : 'after');
      return { ...state, tasks: newTasks };
    }

    case 'REORDER_TASK': {
      if (action.id === action.targetId) return state;

      const descendants = getDescendants(action.id, state.tasks);
      if (descendants.some(t => t.id === action.targetId)) return state;

      const draggedTask = state.tasks.find(t => t.id === action.id);
      const targetTask = state.tasks.find(t => t.id === action.targetId);
      if (!draggedTask || !targetTask) return state;

      let newParentId = draggedTask.parentId;
      if (action.position === 'inside') {
        newParentId = targetTask.id;
      } else {
        newParentId = targetTask.parentId;
      }

      // Update parentId and collapse state
      const updatedTasks = state.tasks.map(t => {
        if (t.id === action.id) {
          return { ...t, parentId: newParentId };
        }
        if (t.id === action.targetId && action.position === 'inside') {
          return { ...t, collapsed: false };
        }
        return t;
      });

      // Now move the block (draggedTask and its descendants)
      const idsToMove = [action.id, ...descendants.map(t => t.id)];
      const idsSet = new Set(idsToMove);

      const toMove = updatedTasks.filter(t => idsSet.has(t.id));
      const rest = updatedTasks.filter(t => !idsSet.has(t.id));

      const targetIdx = rest.findIndex(t => t.id === action.targetId);
      if (targetIdx < 0) return state;

      let insertAt: number;
      if (action.position === 'before') {
        insertAt = targetIdx;
      } else {
        // after or inside: place after target task and all its descendants
        const targetDescendants = getDescendants(action.targetId, rest);
        const lastDescId = targetDescendants.length > 0 
          ? targetDescendants[targetDescendants.length - 1].id 
          : action.targetId;
        const lastDescIdx = rest.findIndex(t => t.id === lastDescId);
        insertAt = lastDescIdx + 1;
      }

      return {
        ...state,
        tasks: [
          ...rest.slice(0, insertAt),
          ...toMove,
          ...rest.slice(insertAt),
        ],
      };
    }

    case 'PASTE_TASKS': {
      const tasks = [...state.tasks];
      if (action.afterId) {
        const insertIdx = tasks.findIndex(t => t.id === action.afterId);
        if (insertIdx >= 0) {
          tasks.splice(insertIdx + 1, 0, ...action.tasksToInsert);
        } else {
          tasks.push(...action.tasksToInsert);
        }
      } else {
        tasks.push(...action.tasksToInsert);
      }
      return { ...state, tasks };
    }

    case 'TOGGLE_COLLAPSE':
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === action.id ? { ...t, collapsed: !t.collapsed } : t
        ),
      };

    default:
      return state;
  }
}

function findLastIndex(tasks: Task[], taskId: string): number {
  const children = getChildren(taskId, tasks);
  if (children.length === 0) return tasks.findIndex(t => t.id === taskId);
  const lastChild = children[children.length - 1];
  return findLastIndex(tasks, lastChild.id);
}

function getDescendants(parentId: string, tasks: Task[]): Task[] {
  const result: Task[] = [];
  const children = getChildren(parentId, tasks);
  for (const child of children) {
    result.push(child);
    result.push(...getDescendants(child.id, tasks));
  }
  return result;
}

/**
 * タスクとその全子孫をブロックとして、指定位置に移動する。
 * position: 'before' | 'after' で targetId の前か後ろか
 */
function moveTaskBlock(tasks: Task[], taskId: string, targetId: string, position: 'before' | 'after'): Task[] {
  // 移動対象のタスクと全子孫を深さ優先で収集
  const idsToMove: string[] = [];
  function collect(taskId: string) {
    idsToMove.push(taskId);
    for (const child of getChildren(taskId, tasks)) {
      collect(child.id);
    }
  }
  collect(taskId);

  // 対象が自分の子孫内なら移動しない
  if (idsToMove.includes(targetId)) return tasks;

  const idsSet = new Set(idsToMove);
  const toMove = tasks.filter(t => idsSet.has(t.id));
  const rest = tasks.filter(t => !idsSet.has(t.id));

  const targetIdx = rest.findIndex(t => t.id === targetId);
  if (targetIdx < 0) return tasks;

  const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
  return [
    ...rest.slice(0, insertAt),
    ...toMove,
    ...rest.slice(insertAt),
  ];
}

interface ClipboardContent {
  task: Task;
  descendants: Task[];
  isCut: boolean;
}

interface ProjectContextValue {
  project: Project;
  dispatch: React.Dispatch<ProjectAction>;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  viewMode: 'day' | 'week' | 'month';
  setViewMode: (mode: 'day' | 'week' | 'month') => void;
  undo: () => void;
  canUndo: boolean;
  copyTask: (id: string) => void;
  cutTask: (id: string) => void;
  pasteTask: () => void;
  canPaste: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<{ past: Project[]; present: Project }>(() => {
    return { past: [], present: createDefaultProject() };
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [clipboard, setClipboard] = useState<ClipboardContent | null>(null);
  const loaded = useRef(false);

  const project = history.present;

  const dispatch = useCallback((action: ProjectAction) => {
    if (action.type === 'LOAD_PROJECT') {
      setHistory({
        past: [],
        present: action.project,
      });
      return;
    }

    setHistory(curr => {
      const nextPresent = projectReducer(curr.present, action);
      if (nextPresent === curr.present) return curr;

      return {
        past: [...curr.past, curr.present],
        present: nextPresent,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory(curr => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, curr.past.length - 1);
      return {
        past: newPast,
        present: previous,
      };
    });
  }, []);

  const canUndo = history.past.length > 0;

  const copyTask = useCallback((id: string) => {
    const task = project.tasks.find(t => t.id === id);
    if (!task) return;
    const descendants = getDescendants(id, project.tasks);
    setClipboard({
      task,
      descendants,
      isCut: false,
    });
  }, [project.tasks]);

  const cutTask = useCallback((id: string) => {
    const task = project.tasks.find(t => t.id === id);
    if (!task) return;
    const descendants = getDescendants(id, project.tasks);
    setClipboard({
      task,
      descendants,
      isCut: true,
    });
    dispatch({ type: 'DELETE_TASK', id });
    setSelectedTaskId(null);
  }, [project.tasks, dispatch]);

  const pasteTask = useCallback(() => {
    if (!clipboard) return;

    const idMap = new Map<string, string>();
    const newTaskId = crypto.randomUUID();
    idMap.set(clipboard.task.id, newTaskId);
    clipboard.descendants.forEach(d => {
      idMap.set(d.id, crypto.randomUUID());
    });

    let newParentId: string | null = null;
    let afterId: string | null = null;

    if (selectedTaskId) {
      const targetTask = project.tasks.find(t => t.id === selectedTaskId);
      if (targetTask) {
        newParentId = targetTask.parentId;
        // Paste after target task's last descendant
        const targetDescendants = getDescendants(selectedTaskId, project.tasks);
        afterId = targetDescendants.length > 0
          ? targetDescendants[targetDescendants.length - 1].id
          : selectedTaskId;
      }
    } else {
      newParentId = null;
      if (project.tasks.length > 0) {
        afterId = project.tasks[project.tasks.length - 1].id;
      }
    }

    const newMainTask: Task = {
      ...clipboard.task,
      id: newTaskId,
      name: clipboard.isCut ? clipboard.task.name : `${clipboard.task.name} - コピー`,
      parentId: newParentId,
    };

    const newDescendants: Task[] = clipboard.descendants.map(d => ({
      ...d,
      id: idMap.get(d.id)!,
      parentId: idMap.get(d.parentId!) || newParentId,
    }));

    const tasksToInsert = [newMainTask, ...newDescendants];
    dispatch({ type: 'PASTE_TASKS', tasksToInsert, afterId });

    if (clipboard.isCut) {
      setClipboard(null);
    }
  }, [clipboard, selectedTaskId, project.tasks, dispatch]);

  const canPaste = clipboard !== null;

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    loadFromIndexedDB().then(saved => {
      if (saved) {
        dispatch({ type: 'LOAD_PROJECT', project: saved });
      }
    });
  }, [dispatch]);

  useEffect(() => {
    if (!loaded.current) return;
    const timer = setTimeout(() => {
      saveToIndexedDB(project);
    }, 500);
    return () => clearTimeout(timer);
  }, [project]);

  return (
    <ProjectContext.Provider
      value={{
        project,
        dispatch,
        selectedTaskId,
        setSelectedTaskId,
        viewMode,
        setViewMode,
        undo,
        canUndo,
        copyTask,
        cutTask,
        pasteTask,
        canPaste,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
