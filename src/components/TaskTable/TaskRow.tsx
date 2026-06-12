import { useState, memo } from 'react';
import type { Task, TaskDependency } from '../../types';
import { useProject } from '../../store/ProjectContext';
import { getDepth, checkCircularDependency } from '../../utils/taskTree';
import { formatDeps, parseDepsInput, toStorage } from '../../utils/deps';
import type { ColWidths } from './TaskTable';
import styles from './TaskTable.module.css';

interface TaskRowProps {
  task: Task;
  rowNumber: number;
  wbs: string;
  isSelected: boolean;
  isDragged: boolean;
  showDropBefore: boolean;
  showDropAfter: boolean;
  showDropInside: boolean;
  colWidths: ColWidths;
  onSelect: (id: string, ctrlKey: boolean, shiftKey: boolean) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDragLeave: () => void;
}

export const TaskRow = memo(function TaskRow({
  task,
  rowNumber,
  wbs,
  isSelected,
  isDragged,
  showDropBefore,
  showDropAfter,
  showDropInside,
  colWidths,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onDragLeave,
}: TaskRowProps) {
  const { project, dispatch } = useProject();
  const depth = getDepth(task.id, project.tasks);
  const hasChildren = project.tasks.some(t => t.parentId === task.id);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (field: string, value: string) => {
    setEditingField(field);
    setEditValue(value);
  };

  const commitEdit = () => {
    if (!editingField) return;

    const changes: Partial<Task> = {};
    switch (editingField) {
      case 'name':
        changes.name = editValue;
        break;
      case 'startDate':
        changes.startDate = editValue;
        break;
      case 'endDate':
        changes.endDate = editValue;
        break;
      case 'duration':
        changes.duration = Number(editValue) || 0;
        break;
      case 'progress':
        changes.progress = Math.max(0, Math.min(100, Math.round(Number(editValue) || 0)));
        break;
      case 'assignee':
        changes.assignee = editValue;
        break;
      case 'notes':
        changes.notes = editValue;
        break;
      case 'dependencies': {
        const { tokens, invalid } = parseDepsInput(editValue, project.tasks.length);
        const invalidDeps: string[] = [...invalid];
        const validDeps: TaskDependency[] = [];
        for (const tok of tokens) {
          const depTask = project.tasks[tok.row - 1];
          if (!depTask || depTask.id === task.id ||
              checkCircularDependency(task.id, depTask.id, project.tasks)) {
            invalidDeps.push(String(tok.row));
            continue;
          }
          validDeps.push(toStorage({ id: depTask.id, type: tok.type, lag: tok.lag }));
        }
        if (invalidDeps.length > 0) {
          alert(`先行タスクの指定「${invalidDeps.join(', ')}」は無効です（書式誤り・自己参照・循環依存のいずれか）。\n書式例: 3 / 3SS / 3FS+2 / 3-1`);
          setEditingField(null);
          return;
        }
        changes.dependencies = validDeps;
        break;
      }
    }

    dispatch({ type: 'UPDATE_TASK', id: task.id, changes });
    setEditingField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  const handleToggleCollapse = () => {
    dispatch({ type: 'TOGGLE_COLLAPSE', id: task.id });
  };

  const renderCell = (field: string, value: string, displayValue?: string) => {
    if (editingField === field) {
      return (
        <input
          className={styles.editInput}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          autoFocus
        />
      );
    }
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          startEdit(field, value);
        }}
        style={{ cursor: 'text' }}
      >
        {displayValue ?? value}
      </span>
    );
  };

  const rowClass = [
    styles.row,
    isSelected && styles.selected,
    isDragged && styles.dragging,
    showDropBefore && styles.dropBefore,
    showDropAfter && styles.dropAfter,
    showDropInside && styles.dropInside,
  ].filter(Boolean).join(' ');

  const colStyle = (col: keyof ColWidths): React.CSSProperties => {
    return { width: colWidths[col], minWidth: colWidths[col] };
  };

  const mutedStyle: React.CSSProperties = { color: 'var(--text-muted)' };

  return (
    <tr
      className={rowClass}
      draggable
      data-task-id={task.id}
      onClick={(e) => onSelect(task.id, e.ctrlKey || e.metaKey, e.shiftKey)}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        onDragStart(task.id);
      }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, task.id); }}
      onDrop={(e) => onDrop(e, task.id)}
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
    >
      <td className={styles.cell} style={{ ...colStyle('rowNum'), ...mutedStyle }}>
        {rowNumber}
      </td>
      <td className={styles.cell} style={{ ...colStyle('wbs'), ...mutedStyle }}>
        {wbs}
      </td>
      <td className={styles.cell} style={colStyle('name')}>
        <div className={styles.taskNameWrapper} style={{ '--indent': depth } as React.CSSProperties}>
          {hasChildren ? (
            <button className={styles.expandButton} onClick={(e) => { e.stopPropagation(); handleToggleCollapse(); }}>
              {task.collapsed ? '▶' : '▼'}
            </button>
          ) : (
            <span style={{ width: 18, display: 'inline-block', flexShrink: 0 }} />
          )}
          {task.isMilestone && <span className={styles.milestoneMark}>◆</span>}
          {renderCell('name', task.name)}
        </div>
      </td>
      <td className={styles.cell} style={colStyle('duration')}>
        {renderCell('duration', String(task.duration), `${task.duration}日`)}
      </td>
      <td className={styles.cell} style={colStyle('startDate')}>
        {renderCell('startDate', task.startDate)}
      </td>
      <td className={styles.cell} style={colStyle('endDate')}>
        {renderCell('endDate', task.endDate)}
      </td>
      <td className={styles.cell} style={colStyle('progress')}>
        {renderCell('progress', String(task.progress), `${task.progress}%`)}
      </td>
      <td className={styles.cell} style={colStyle('assignee')}>
        {renderCell('assignee', task.assignee || '', task.assignee || '-')}
      </td>
      {(() => {
        const depsValue = formatDeps(task, project.tasks);
        return (
          <td className={styles.cell} style={colStyle('dependencies')}>
            {renderCell('dependencies', depsValue, depsValue || '-')}
          </td>
        );
      })()}
      <td className={styles.cell} style={colStyle('notes')} title={task.notes || undefined}>
        {renderCell('notes', task.notes || '', task.notes || '-')}
      </td>
    </tr>
  );
});
