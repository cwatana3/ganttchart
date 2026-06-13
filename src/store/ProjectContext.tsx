import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { Project, ProjectAction, Task, Calendar, BaselineEntry } from '../types';
import { createDefaultProject } from '../types';
import { toDepRef } from '../utils/deps';
import {
  getFlattenedTasks,
  getChildren,
  getPreviousSibling,
  canIndent,
  canOutdent,
} from '../utils/taskTree';
import { addWorkingDays, fromDate, toDate, countWorkingDays } from '../utils/calendar';
import { scheduleProject } from '../utils/schedule';
import { addDays } from 'date-fns';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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

function applyTaskChanges(t: Task, changes: Partial<Task>, calendar: Calendar): Task {
  const updated = { ...t, ...changes };

  if (changes.duration !== undefined && !changes.endDate) {
    updated.isMilestone = updated.duration === 0;
    if (updated.isMilestone) {
      updated.endDate = updated.startDate;
    } else {
      updated.endDate = addWorkingDays(updated.startDate, updated.duration, calendar);
    }
  } else if (changes.startDate !== undefined && !changes.endDate) {
    if (updated.isMilestone) {
      updated.endDate = updated.startDate;
    } else {
      updated.endDate = addWorkingDays(updated.startDate, updated.duration, calendar);
    }
  } else if (changes.endDate !== undefined && changes.startDate === undefined) {
    updated.duration = countWorkingDays(updated.startDate, updated.endDate, calendar);
    updated.isMilestone = updated.duration === 0;
  }

  return updated;
}

function rawProjectReducer(state: Project, action: ProjectAction): Project {
  switch (action.type) {
    case 'LOAD_PROJECT':
      return action.project;

    case 'SET_PROJECT_NAME':
      return { ...state, name: action.name };

    case 'SET_CALENDAR':
      return { ...state, calendar: action.calendar };

    case 'SET_AUTO_SCHEDULE':
      return { ...state, autoSchedule: action.enabled };

    case 'SET_BASELINE': {
      const baseline: Record<string, BaselineEntry> = {};
      for (const t of state.tasks) {
        baseline[t.id] = { startDate: t.startDate, endDate: t.endDate };
      }
      return { ...state, baseline };
    }

    case 'CLEAR_BASELINE': {
      if (!state.baseline) return state;
      const next = { ...state };
      delete next.baseline;
      return next;
    }

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
          const baseInsertPos = tasks.findIndex(t => t.id === lastDescId);
          
          // 同じ親の次の兄弟がいる場合、その手前
          const siblings = tasks.filter(t => t.parentId === action.parentId);
          const afterSibIdx = siblings.findIndex(t => t.id === action.afterId);
          if (afterSibIdx < siblings.length - 1) {
            const nextSib = siblings[afterSibIdx + 1];
            const siblingInsertPos = tasks.findIndex(t => t.id === nextSib.id);
            tasks.splice(siblingInsertPos, 0, newTask);
          } else {
            // 最後の兄弟の場合、対象タスクブロックの直後
            tasks.splice(baseInsertPos + 1, 0, newTask);
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



    case 'DELETE_TASKS': {
      const idsToDelete = new Set<string>(action.ids);
      function collectChildren(parentId: string) {
        for (const child of getChildren(parentId, state.tasks)) {
          idsToDelete.add(child.id);
          collectChildren(child.id);
        }
      }
      for (const id of action.ids) {
        collectChildren(id);
      }
      const remainingTasks = state.tasks.filter(t => !idsToDelete.has(t.id)).map(t => {
        if (t.dependencies && t.dependencies.some(d => idsToDelete.has(toDepRef(d).id))) {
          return {
            ...t,
            dependencies: t.dependencies.filter(d => !idsToDelete.has(toDepRef(d).id)),
          };
        }
        return t;
      });
      return { ...state, tasks: remainingTasks };
    }

    case 'UPDATE_TASK': {
      const tasks = state.tasks.map(t =>
        t.id === action.id ? applyTaskChanges(t, action.changes, state.calendar) : t
      );
      return { ...state, tasks };
    }

    case 'UPDATE_TASKS': {
      const ids = new Set(action.ids);
      const tasks = state.tasks.map(t =>
        ids.has(t.id) ? applyTaskChanges(t, action.changes, state.calendar) : t
      );
      return { ...state, tasks };
    }

    case 'SHIFT_TASKS': {
      const idsSet = new Set(action.ids);
      const tasks = state.tasks.map(t => {
        if (!idsSet.has(t.id)) return t;
        const start = toDate(t.startDate);
        const end = toDate(t.endDate);
        const newStart = fromDate(addDays(start, action.dayOffset));
        const newEnd = fromDate(addDays(end, action.dayOffset));
        return {
          ...t,
          startDate: newStart,
          endDate: newEnd,
        };
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

    case 'REORDER_TASKS': {
      const selectedIds = action.ids;
      if (selectedIds.length === 0) return state;
      if (selectedIds.includes(action.targetId)) return state;

      // Collect all descendants of selected tasks
      const idsToMove = new Set<string>();
      for (const id of selectedIds) {
        idsToMove.add(id);
        for (const desc of getDescendants(id, state.tasks)) {
          idsToMove.add(desc.id);
        }
      }

      // If target task is one of the tasks to move (or their descendants), invalid operation.
      if (idsToMove.has(action.targetId)) return state;

      const targetTask = state.tasks.find(t => t.id === action.targetId);
      if (!targetTask) return state;

      let newParentId = targetTask.parentId;
      if (action.position === 'inside') {
        newParentId = targetTask.id;
      } else {
        newParentId = targetTask.parentId;
      }

      // Root dragged tasks: those in selectedIds whose parent is not in selectedIds
      const rootDraggedIds = new Set<string>();
      for (const id of selectedIds) {
        let isRoot = true;
        const task = state.tasks.find(t => t.id === id);
        if (task) {
          let curr = task.parentId;
          while (curr) {
            if (selectedIds.includes(curr)) {
              isRoot = false;
              break;
            }
            const parentTask = state.tasks.find(t => t.id === curr);
            curr = parentTask ? parentTask.parentId : null;
          }
        }
        if (isRoot) {
          rootDraggedIds.add(id);
        }
      }

      // Update parentId of root dragged tasks and collapse state of target if inside
      const updatedTasks = state.tasks.map(t => {
        if (rootDraggedIds.has(t.id)) {
          return { ...t, parentId: newParentId };
        }
        if (t.id === action.targetId && action.position === 'inside') {
          return { ...t, collapsed: false };
        }
        return t;
      });

      const toMove = updatedTasks.filter(t => idsToMove.has(t.id));
      const rest = updatedTasks.filter(t => !idsToMove.has(t.id));

      const targetIdx = rest.findIndex(t => t.id === action.targetId);
      if (targetIdx < 0) return state;

      let insertAt: number;
      if (action.position === 'before') {
        insertAt = targetIdx;
      } else {
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

function updateParentTasks(tasks: Task[], calendar: Calendar): Task[] {
  const parentIds = new Set(tasks.map(t => t.parentId).filter(Boolean) as string[]);
  
  if (parentIds.size === 0) return tasks;

  const memo = new Map<string, { startDate: string; endDate: string; duration: number; progress: number }>();

  function resolve(parentId: string): { startDate: string; endDate: string; duration: number; progress: number } {
    if (memo.has(parentId)) return memo.get(parentId)!;

    const children = tasks.filter(t => t.parentId === parentId);
    let earliestStart = '';
    let latestEnd = '';
    let weightedProgress = 0;
    let totalWeight = 0;
    let progressSum = 0;

    for (const child of children) {
      let start = child.startDate;
      let end = child.endDate;
      let childDuration = child.duration;
      let childProgress = child.progress;

      if (parentIds.has(child.id)) {
        const resolvedChild = resolve(child.id);
        start = resolvedChild.startDate;
        end = resolvedChild.endDate;
        childDuration = resolvedChild.duration;
        childProgress = resolvedChild.progress;
      }

      if (!earliestStart || start < earliestStart) earliestStart = start;
      if (!latestEnd || end > latestEnd) latestEnd = end;

      weightedProgress += childDuration * childProgress;
      totalWeight += childDuration;
      progressSum += childProgress;
    }

    const duration = earliestStart && latestEnd ? countWorkingDays(earliestStart, latestEnd, calendar) : 0;
    // 期間加重平均（マイルストーンのみの場合は単純平均）
    const progress = totalWeight > 0
      ? Math.round(weightedProgress / totalWeight)
      : children.length > 0 ? Math.round(progressSum / children.length) : 0;
    const res = { startDate: earliestStart, endDate: latestEnd, duration, progress };
    memo.set(parentId, res);
    return res;
  }

  for (const pId of parentIds) {
    resolve(pId);
  }

  return tasks.map(t => {
    if (parentIds.has(t.id)) {
      const resolved = memo.get(t.id);
      if (resolved) {
        if (
          t.startDate === resolved.startDate &&
          t.endDate === resolved.endDate &&
          t.duration === resolved.duration &&
          t.progress === resolved.progress &&
          !t.isMilestone
        ) {
          return t;
        }
        return {
          ...t,
          startDate: resolved.startDate,
          endDate: resolved.endDate,
          duration: resolved.duration,
          progress: resolved.progress,
          isMilestone: false,
        };
      }
    }
    return t;
  });
}

function projectReducer(state: Project, action: ProjectAction): Project {
  const nextState = rawProjectReducer(state, action);
  if (nextState === state) return state;

  let tasks = nextState.tasks;
  if (nextState.autoSchedule) {
    // 依存制約を満たすよう後送り → 親を再集約（リーフが動くと親の期間も変わる）
    tasks = updateParentTasks(scheduleProject(updateParentTasks(tasks, nextState.calendar), nextState.calendar), nextState.calendar);
  } else {
    tasks = updateParentTasks(tasks, nextState.calendar);
  }

  return { ...nextState, tasks };
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
  selectedTaskIds: string[];
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  viewMode: 'day' | 'week' | 'month';
  setViewMode: (mode: 'day' | 'week' | 'month') => void;
  showCriticalPath: boolean;
  setShowCriticalPath: React.Dispatch<React.SetStateAction<boolean>>;
  filterText: string;
  setFilterText: React.Dispatch<React.SetStateAction<string>>;
  undo: () => void;
  canUndo: boolean;
  redo: () => void;
  canRedo: boolean;
  copyTask: (id: string) => void;
  cutTask: (id: string) => void;
  pasteTask: () => void;
  canPaste: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<{ past: Project[]; present: Project; future: Project[] }>(() => {
    return { past: [], present: createDefaultProject(), future: [] };
  });
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const selectedTaskId = selectedTaskIds.length > 0 ? selectedTaskIds[selectedTaskIds.length - 1] : null;
  const setSelectedTaskId = useCallback((id: string | null) => {
    setSelectedTaskIds(id ? [id] : []);
  }, []);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [clipboard, setClipboard] = useState<ClipboardContent | null>(null);
  const loaded = useRef(false);

  const project = history.present;

  const dispatch = useCallback((action: ProjectAction) => {
    if (action.type === 'LOAD_PROJECT') {
      setHistory({
        past: [],
        present: action.project,
        future: [],
      });
      return;
    }

    setHistory(curr => {
      const nextPresent = projectReducer(curr.present, action);
      if (nextPresent === curr.present) return curr;

      return {
        past: [...curr.past, curr.present],
        present: nextPresent,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory(curr => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      return {
        past: curr.past.slice(0, curr.past.length - 1),
        present: previous,
        future: [curr.present, ...curr.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(curr => {
      if (curr.future.length === 0) return curr;
      const [next, ...restFuture] = curr.future;
      return {
        past: [...curr.past, curr.present],
        present: next,
        future: restFuture,
      };
    });
  }, []);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

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
    dispatch({ type: 'DELETE_TASKS', ids: [id] });
    setSelectedTaskId(null);
  }, [project.tasks, dispatch]);

  const pasteTask = useCallback(() => {
    if (!clipboard) return;

    const idMap = new Map<string, string>();
    const newTaskId = generateId();
    idMap.set(clipboard.task.id, newTaskId);
    clipboard.descendants.forEach(d => {
      idMap.set(d.id, generateId());
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
        selectedTaskIds,
        setSelectedTaskIds,
        selectedTaskId,
        setSelectedTaskId,
        viewMode,
        setViewMode,
        showCriticalPath,
        setShowCriticalPath,
        filterText,
        setFilterText,
        undo,
        canUndo,
        redo,
        canRedo,
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
