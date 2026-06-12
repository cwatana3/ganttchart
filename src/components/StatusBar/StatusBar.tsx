import { useState } from 'react';
import { useProject } from '../../store/ProjectContext';
import styles from './StatusBar.module.css';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export function StatusBar() {
  const { project, dispatch, selectedTaskIds } = useProject();
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const workingDaysStr = project.calendar.workingDays
    .map(d => DAY_LABELS[d])
    .join('・');

  const startEdit = () => {
    setNameValue(project.name);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== project.name) {
      dispatch({ type: 'SET_PROJECT_NAME', name: trimmed });
    }
    setEditing(false);
  };

  return (
    <div className={styles.statusBar}>
      <span>
        プロジェクト:{' '}
        {editing ? (
          <input
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            autoFocus
            style={{
              background: 'var(--input-bg)',
              color: 'var(--text-color)',
              border: '1px solid var(--accent-color)',
              borderRadius: 'var(--radius-sm)',
              font: 'inherit',
              padding: '1px 6px',
              outline: 'none',
            }}
          />
        ) : (
          <span
            onClick={startEdit}
            title="クリックで名前を変更"
            style={{ cursor: 'text', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
          >
            {project.name}
          </span>
        )}
      </span>
      <div className={styles.item}>
        {selectedTaskIds.length > 0 && (
          <span style={{ color: 'var(--accent-color)', fontWeight: 600 }}>
            選択中: {selectedTaskIds.length}件
          </span>
        )}
        <span>全タスク: {project.tasks.length}件</span>
        <span>稼働日: {workingDaysStr}</span>
      </div>
    </div>
  );
}
