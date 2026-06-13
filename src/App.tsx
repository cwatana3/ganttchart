import { useState, useRef, useEffect, useMemo } from 'react';
import { Toolbar } from './components/Toolbar/Toolbar';
import { TaskTable } from './components/TaskTable/TaskTable';
import { GanttView } from './components/GanttView/GanttView';
import { CalendarSettings } from './components/CalendarSettings/CalendarSettings';
import { ExportDialog } from './components/ExportDialog/ExportDialog';
import { SplitPane } from './components/SplitPane/SplitPane';
import { StatusBar } from './components/StatusBar/StatusBar';
import { ContextMenu } from './components/ContextMenu/ContextMenu';
import { useProject } from './store/ProjectContext';
import { canIndent, canOutdent, getFilteredVisibleTasks } from './utils/taskTree';
import styles from './App.module.css';

const BAR_COLORS: (string | null)[] = [
  '#ef4444', '#f59e0b', '#10b981', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#64748b',
  null,
];

export function App() {
  const [showCalendar, setShowCalendar] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string | null } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ganttRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollToTodayRef = useRef<(() => void) | null>(null);

  const {
    project,
    selectedTaskIds,
    setSelectedTaskIds,
    selectedTaskId,
    setSelectedTaskId,
    dispatch,
    undo,
    canUndo,
    redo,
    canRedo,
    copyTask,
    cutTask,
    pasteTask,
    canPaste,
    filterText,
  } = useProject();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcut triggers when the user is inside an input field
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      // 1. Undo: Ctrl + Z / Redo: Ctrl + Y or Ctrl + Shift + Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) {
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (canRedo) {
          redo();
        }
      }

      // 2. Copy: Ctrl + C
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedTaskId) {
          e.preventDefault();
          copyTask(selectedTaskId);
        }
      }

      // 3. Cut: Ctrl + X
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (selectedTaskId) {
          e.preventDefault();
          cutTask(selectedTaskId);
        }
      }

      // 4. Paste: Ctrl + V
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (canPaste) {
          e.preventDefault();
          pasteTask();
        }
      }

      // 5. Delete: Delete
      if (e.key === 'Delete') {
        if (selectedTaskIds.length > 0) {
          e.preventDefault();
          dispatch({ type: 'DELETE_TASKS', ids: selectedTaskIds });
          setSelectedTaskIds([]);
        }
      }

      // 6. Enter: add a task right below the selection
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && selectedTaskId) {
        e.preventDefault();
        const task = project.tasks.find(t => t.id === selectedTaskId);
        dispatch({ type: 'ADD_TASK', parentId: task ? task.parentId : null, afterId: selectedTaskId });
      }

      // 7. Tab / Shift+Tab: indent / outdent
      if (e.key === 'Tab' && selectedTaskId) {
        e.preventDefault();
        if (e.shiftKey) {
          if (canOutdent(selectedTaskId, project.tasks)) {
            dispatch({ type: 'OUTDENT_TASK', id: selectedTaskId });
          }
        } else if (canIndent(selectedTaskId, project.tasks)) {
          dispatch({ type: 'INDENT_TASK', id: selectedTaskId });
        }
      }

      // 8. ArrowUp / ArrowDown: move selection
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const visible = getFilteredVisibleTasks(project.tasks, filterText);
        if (visible.length > 0) {
          e.preventDefault();
          const idx = selectedTaskId ? visible.findIndex(t => t.id === selectedTaskId) : -1;
          const nextIdx = e.key === 'ArrowDown'
            ? Math.min(visible.length - 1, idx + 1)
            : Math.max(0, idx === -1 ? 0 : idx - 1);
          setSelectedTaskId(visible[nextIdx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedTaskIds,
    setSelectedTaskIds,
    selectedTaskId,
    setSelectedTaskId,
    project.tasks,
    dispatch,
    undo,
    canUndo,
    redo,
    canRedo,
    copyTask,
    cutTask,
    pasteTask,
    canPaste,
    filterText,
  ]);

  // Context Menu event handler
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Show browser default context menu inside inputs
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const target = e.target as HTMLElement;
      const taskEl = target.closest('[data-task-id]');
      if (taskEl) {
        e.preventDefault();
        const taskId = taskEl.getAttribute('data-task-id')!;
        if (!selectedTaskIds.includes(taskId)) {
          setSelectedTaskIds([taskId]);
        }
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          taskId,
        });
      } else {
        // Only trigger generic context menu if right clicking inside App container, 
        // but not in inputs/scroll bars area if unwanted. Standard area check:
        const appContainer = document.querySelector(`.${styles.app}`);
        if (appContainer && appContainer.contains(target)) {
          e.preventDefault();
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            taskId: null,
          });
        }
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, [selectedTaskIds, setSelectedTaskIds, project.tasks]);

  const menuItems = useMemo(() => {
    if (!contextMenu) return [];

    const taskId = contextMenu.taskId;

    if (taskId) {
      const isIndentDisabled = !canIndent(taskId, project.tasks);
      const isOutdentDisabled = !canOutdent(taskId, project.tasks);

      return [
        {
          label: '＋ 子タスクを追加',
          onClick: () => dispatch({ type: 'ADD_TASK', parentId: taskId }),
        },
        {
          label: '＋ 直後にタスクを追加',
          onClick: () => {
            const task = project.tasks.find(t => t.id === taskId);
            dispatch({ type: 'ADD_TASK', parentId: task ? task.parentId : null, afterId: taskId });
          },
        },
        { label: '-' },
        {
          label: '⇥ インデント',
          onClick: () => dispatch({ type: 'INDENT_TASK', id: taskId }),
          disabled: isIndentDisabled,
        },
        {
          label: '⇤ アウトデント',
          onClick: () => dispatch({ type: 'OUTDENT_TASK', id: taskId }),
          disabled: isOutdentDisabled,
        },
        { label: '-' },
        {
          label: '🎨 バーの色',
          swatches: BAR_COLORS,
          onPickSwatch: (color: string | null) => {
            const ids = selectedTaskIds.includes(taskId) ? selectedTaskIds : [taskId];
            dispatch({ type: 'UPDATE_TASKS', ids, changes: { color: color ?? undefined } });
          },
        },
        { label: '-' },
        {
          label: '📋 コピー (Ctrl+C)',
          onClick: () => copyTask(taskId),
        },
        {
          label: '✂ 切り取り (Ctrl+X)',
          onClick: () => cutTask(taskId),
        },
        {
          label: '📥 貼り付け (Ctrl+V)',
          onClick: pasteTask,
          disabled: !canPaste,
        },
        { label: '-' },
        {
          label: selectedTaskIds.length > 1 ? `🗑 選択した ${selectedTaskIds.length} 件のタスクを削除 (Delete)` : '🗑 削除 (Delete)',
          onClick: () => {
            const idsToDelete = selectedTaskIds.length > 0 ? selectedTaskIds : [taskId];
            dispatch({ type: 'DELETE_TASKS', ids: idsToDelete });
            setSelectedTaskIds([]);
          },
          danger: true,
        },
      ];
    } else {
      return [
        {
          label: '＋ 新規タスクを追加',
          onClick: () => dispatch({ type: 'ADD_TASK', parentId: null }),
        },
        {
          label: '⎌ 元に戻す (Ctrl+Z)',
          onClick: undo,
          disabled: !canUndo,
        },
        {
          label: '📥 貼り付け (Ctrl+V)',
          onClick: pasteTask,
          disabled: !canPaste,
        },
      ];
    }
  }, [
    contextMenu,
    project.tasks,
    selectedTaskIds,
    setSelectedTaskIds,
    selectedTaskId,
    setSelectedTaskId,
    canUndo,
    undo,
    copyTask,
    cutTask,
    pasteTask,
    canPaste,
    dispatch,
  ]);

  return (
    <div className={styles.app}>
      <Toolbar
        onOpenCalendar={() => setShowCalendar(true)}
        onOpenExport={() => setShowExport(true)}
        onToday={() => scrollToTodayRef.current?.()}
      />
      <SplitPane
        left={<TaskTable />}
        right={<GanttView svgRef={svgRef} wrapperRef={ganttRef} scrollRef={scrollRef} scrollToTodayRef={scrollToTodayRef} />}
        scrollRef={scrollRef}
      />
      <StatusBar />
      {showCalendar && (
        <CalendarSettings onClose={() => setShowCalendar(false)} />
      )}
      {showExport && (
        <ExportDialog onClose={() => setShowExport(false)} />
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={menuItems}
        />
      )}
    </div>
  );
}
