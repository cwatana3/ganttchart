import { useState, memo } from 'react';
import type { Task } from '../../types';
import { useProject } from '../../store/ProjectContext';
import { getDepth, checkCircularDependency } from '../../utils/taskTree';
import styles from './TaskTable.module.css';

interface ColWidths {
  name: number;
  duration: number;
  startDate: number;
  endDate: number;
  assignee: number;
  dependencies: number;
}

interface TaskRowProps {
  task: Task;
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
      case 'assignee':
        changes.assignee = editValue;
        break;
      case 'dependencies': {
        const nums = editValue
          .split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n) && n > 0 && n <= project.tasks.length);
        const invalidDeps: number[] = [];
        const validDepIds: string[] = [];
        for (const num of nums) {
          const depTask = project.tasks[num - 1];
          if (!depTask) continue;
          if (depTask.id === task.id) {
            invalidDeps.push(num);
            continue;
          }
          if (checkCircularDependency(task.id, depTask.id, project.tasks)) {
            invalidDeps.push(num);
          } else {
            validDepIds.push(depTask.id);
          }
        }
        if (invalidDeps.length > 0) {
          alert(`タスク ${invalidDeps.join(', ')} は循環依存関係が発生するため、先行タスクとして追加できません。`);
          setEditingField(null);
          return;
        }
        changes.dependencies = validDepIds;
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
      <td className={styles.cell} style={colStyle('assignee')}>
        {renderCell('assignee', task.assignee || '', task.assignee || '-')}
      </td>
      {(() => {
        const depsValue = (task.dependencies ?? [])
          .map(dId => {
            const idx = project.tasks.findIndex(t => t.id === dId);
            return idx !== -1 ? String(idx + 1) : '';
          })
          .filter(Boolean)
          .join(', ');
        return (
          <td className={styles.cell} style={colStyle('dependencies')}>
            {renderCell('dependencies', depsValue, depsValue || '-')}
          </td>
        );
      })()}
    </tr>
  );
});
