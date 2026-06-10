import { useState, useRef, useEffect, useMemo } from 'react';
import { Toolbar } from './components/Toolbar/Toolbar';
import { TaskTable } from './components/TaskTable/TaskTable';
import { GanttView } from './components/GanttView/GanttView';
import { CalendarSettings } from './components/CalendarSettings/CalendarSettings';
import { SplitPane } from './components/SplitPane/SplitPane';
import { StatusBar } from './components/StatusBar/StatusBar';
import { ContextMenu } from './components/ContextMenu/ContextMenu';
import { useProject } from './store/ProjectContext';
import { canIndent, canOutdent } from './utils/taskTree';
import styles from './App.module.css';

export function App() {
  const [showCalendar, setShowCalendar] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string | null } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ganttRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const {
    project,
    selectedTaskId,
    setSelectedTaskId,
    dispatch,
    undo,
    canUndo,
    copyTask,
    cutTask,
    pasteTask,
    canPaste,
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

      // 1. Undo: Ctrl + Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (canUndo) {
          undo();
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
        if (selectedTaskId) {
          e.preventDefault();
          dispatch({ type: 'DELETE_TASK', id: selectedTaskId });
          setSelectedTaskId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedTaskId,
    setSelectedTaskId,
    dispatch,
    undo,
    canUndo,
    copyTask,
    cutTask,
    pasteTask,
    canPaste,
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
        setSelectedTaskId(taskId);
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
  }, [setSelectedTaskId, project.tasks]);

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
          label: '🗑 削除 (Delete)',
          onClick: () => {
            dispatch({ type: 'DELETE_TASK', id: taskId });
            if (selectedTaskId === taskId) {
              setSelectedTaskId(null);
            }
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
      />
      <SplitPane
        left={<TaskTable />}
        right={<GanttView svgRef={svgRef} wrapperRef={ganttRef} scrollRef={scrollRef} />}
        scrollRef={scrollRef}
      />
      <StatusBar />
      {showCalendar && (
        <CalendarSettings onClose={() => setShowCalendar(false)} />
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
