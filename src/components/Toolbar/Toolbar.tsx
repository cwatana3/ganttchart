import { useRef } from 'react';
import { useProject } from '../../store/ProjectContext';
import { useTheme } from '../../store/ThemeContext';
import { importFromJSON, exportToJSON, exportToSVG } from '../../utils/export';
import { canIndent, canOutdent } from '../../utils/taskTree';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  onOpenCalendar: () => void;
}

export function Toolbar({ onOpenCalendar }: ToolbarProps) {
  const {
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
  } = useProject();
  const { light, toggle: toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNew = () => {
    if (confirm('現在のプロジェクトを破棄して新規作成しますか？')) {
      dispatch({ type: 'LOAD_PROJECT', project: { name: '新規プロジェクト', calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [] }, tasks: [] } });
      setSelectedTaskId(null);
    }
  };

  const handleOpen = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importFromJSON(file);
      dispatch({ type: 'LOAD_PROJECT', project: imported });
      setSelectedTaskId(null);
    } catch {
      alert('ファイルの読み込みに失敗しました');
    }
    e.target.value = '';
  };

  const handleSave = () => {
    exportToJSON(project);
  };

  const handleAddTask = () => {
    dispatch({ type: 'ADD_TASK', parentId: null });
  };

  const handleIndent = () => {
    if (selectedTaskId) {
      dispatch({ type: 'INDENT_TASK', id: selectedTaskId });
    }
  };

  const handleOutdent = () => {
    if (selectedTaskId) {
      dispatch({ type: 'OUTDENT_TASK', id: selectedTaskId });
    }
  };

  const handleDeleteTask = () => {
    if (selectedTaskId) {
      dispatch({ type: 'DELETE_TASK', id: selectedTaskId });
      setSelectedTaskId(null);
    }
  };

  const handleExportSVG = () => {
    exportToSVG(project, light, viewMode);
  };

  const isIndentDisabled = !selectedTaskId || !canIndent(selectedTaskId, project.tasks);
  const isOutdentDisabled = !selectedTaskId || !canOutdent(selectedTaskId, project.tasks);

  return (
    <div className={styles.toolbar}>
      <button className={styles.button} onClick={handleNew}>📄 新規</button>
      <button className={styles.button} onClick={handleOpen}>📂 開く</button>
      <button className={styles.button} onClick={handleSave}>💾 保存</button>
      <button
        className={styles.button}
        onClick={undo}
        disabled={!canUndo}
        title="元に戻す (Ctrl+Z)"
      >
        ⎌ 戻す
      </button>

      <div className={styles.separator} />

      <button className={styles.button} onClick={handleAddTask}>＋ タスク追加</button>
      <button
        className={styles.button}
        onClick={handleOutdent}
        disabled={isOutdentDisabled}
        title="左へインデント（親子関係を上げる）"
      >
        ⇤ アウトデント
      </button>
      <button
        className={styles.button}
        onClick={handleIndent}
        disabled={isIndentDisabled}
        title="右へインデント（親子関係を下げる）"
      >
        ⇥ インデント
      </button>

      <div className={styles.separator} />

      <button
        className={styles.button}
        onClick={() => selectedTaskId && copyTask(selectedTaskId)}
        disabled={!selectedTaskId}
        title="コピー (Ctrl+C)"
      >
        📋 コピー
      </button>
      <button
        className={styles.button}
        onClick={() => selectedTaskId && cutTask(selectedTaskId)}
        disabled={!selectedTaskId}
        title="切り取り (Ctrl+X)"
      >
        ✂ カット
      </button>
      <button
        className={styles.button}
        onClick={pasteTask}
        disabled={!canPaste}
        title="貼り付け (Ctrl+V)"
      >
        📥 ペースト
      </button>
      <button
        className={styles.button}
        onClick={handleDeleteTask}
        disabled={!selectedTaskId}
        title="削除 (Delete)"
      >
        🗑 削除
      </button>

      <div className={styles.separator} />

      <div className={styles.labelGroup}>
        <span className={styles.labelText}>時間軸:</span>
        <button
          className={`${styles.button} ${viewMode === 'day' ? styles.active : ''}`}
          onClick={() => setViewMode('day')}
        >
          日
        </button>
        <button
          className={`${styles.button} ${viewMode === 'week' ? styles.active : ''}`}
          onClick={() => setViewMode('week')}
        >
          週
        </button>
        <button
          className={`${styles.button} ${viewMode === 'month' ? styles.active : ''}`}
          onClick={() => setViewMode('month')}
        >
          月
        </button>
      </div>

      <div className={styles.separator} />

      <button className={styles.button} onClick={onOpenCalendar}>📅 カレンダー設定</button>
      <button className={styles.button} onClick={handleExportSVG}>🖼 SVG出力</button>

      <div className={styles.spacer} />

      <button
        className={styles.button}
        onClick={toggleTheme}
        title={light ? 'ダークモードに切替' : 'ライトモードに切替'}
      >
        {light ? '☀' : '🌙'}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}
