import { useRef } from 'react';
import { useProject } from '../../store/ProjectContext';
import { useTheme } from '../../store/ThemeContext';
import { importFromJSON, exportToJSON } from '../../utils/export';
import { exportTasksToCSV, parseTasksFromCSV } from '../../utils/csv';
import { canIndent, canOutdent } from '../../utils/taskTree';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  onOpenCalendar: () => void;
  onOpenExport: () => void;
  onToday?: () => void;
}

export function Toolbar({ onOpenCalendar, onOpenExport, onToday }: ToolbarProps) {
  const {
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
    projectList,
    activeProjectId,
    switchProject,
    createProject,
    duplicateProject,
    deleteProject,
  } = useProject();
  const { light, toggle: toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleNew = () => {
    createProject();
  };

  const handleDeleteProject = () => {
    const meta = projectList.find(p => p.id === activeProjectId);
    if (meta && confirm(`プロジェクト「${meta.name}」を削除しますか？この操作は元に戻せません。`)) {
      deleteProject(activeProjectId);
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
    if (selectedTaskIds.length > 0) {
      dispatch({ type: 'DELETE_TASKS', ids: selectedTaskIds });
      setSelectedTaskIds([]);
    }
  };

  const hasBaseline = !!project.baseline;
  const handleBaseline = () => {
    if (hasBaseline) {
      if (confirm('記録済みの基準線（計画）をクリアしますか？')) {
        dispatch({ type: 'CLEAR_BASELINE' });
      }
    } else {
      dispatch({ type: 'SET_BASELINE' });
    }
  };

  const handleExportCSV = () => {
    const csv = exportTasksToCSV(project);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportCSVClick = () => {
    csvInputRef.current?.click();
  };

  const handleCSVFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const tasks = parseTasksFromCSV(text);
      if (tasks.length === 0) {
        alert('CSVから読み込めるタスクがありませんでした');
      } else if (confirm(`現在のタスクを ${tasks.length} 件のCSVタスクで置き換えますか？（カレンダー設定は維持されます）`)) {
        dispatch({ type: 'LOAD_PROJECT', project: { ...project, tasks } });
        setSelectedTaskId(null);
      }
    } catch {
      alert('CSVの読み込みに失敗しました');
    }
    e.target.value = '';
  };

  const isIndentDisabled = !selectedTaskId || !canIndent(selectedTaskId, project.tasks);
  const isOutdentDisabled = !selectedTaskId || !canOutdent(selectedTaskId, project.tasks);

  return (
    <div className={styles.toolbar}>
      <div className={styles.projectSwitcher}>
        <select
          className={styles.projectSelect}
          value={activeProjectId}
          onChange={e => switchProject(e.target.value)}
          title="プロジェクトを切り替え"
        >
          {projectList.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className={styles.iconButton} onClick={createProject} title="新規プロジェクト">＋</button>
        <button className={styles.iconButton} onClick={duplicateProject} title="プロジェクトを複製">⧉</button>
        <button
          className={styles.iconButton}
          onClick={handleDeleteProject}
          disabled={projectList.length <= 1}
          title="プロジェクトを削除"
        >
          🗑
        </button>
      </div>

      <div className={styles.separator} />

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
      <button
        className={styles.button}
        onClick={redo}
        disabled={!canRedo}
        title="やり直す (Ctrl+Y)"
      >
        ↻ やり直す
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
        disabled={selectedTaskIds.length === 0}
        title="削除 (Delete)"
      >
        🗑 削除
      </button>

      <div className={styles.separator} />

      <div className={styles.labelGroup}>
        <span className={styles.labelText}>時間軸:</span>
        <div className={styles.segmentedControl}>
          <button
            className={`${styles.segmentedButton} ${viewMode === 'day' ? styles.active : ''}`}
            onClick={() => setViewMode('day')}
          >
            日
          </button>
          <button
            className={`${styles.segmentedButton} ${viewMode === 'week' ? styles.active : ''}`}
            onClick={() => setViewMode('week')}
          >
            週
          </button>
          <button
            className={`${styles.segmentedButton} ${viewMode === 'month' ? styles.active : ''}`}
            onClick={() => setViewMode('month')}
          >
            月
          </button>
        </div>
      </div>
      <button className={styles.button} onClick={onToday} title="今日の位置へスクロール">📍 今日</button>

      <button
        className={`${styles.button} ${project.autoSchedule ? styles.active : ''}`}
        onClick={() => dispatch({ type: 'SET_AUTO_SCHEDULE', enabled: !project.autoSchedule })}
        title="依存関係に基づいて後続タスクを自動で後送りします"
      >
        {project.autoSchedule ? '🔗 自動配置: ON' : '🔗 自動配置: OFF'}
      </button>
      <button
        className={`${styles.button} ${showCriticalPath ? styles.active : ''}`}
        onClick={() => setShowCriticalPath(v => !v)}
        title="クリティカルパス（プロジェクト完了を左右するタスク）を強調表示します"
      >
        🛤 クリティカルパス
      </button>
      <button
        className={`${styles.button} ${hasBaseline ? styles.active : ''}`}
        onClick={handleBaseline}
        title={hasBaseline ? '記録済みの基準線をクリアします' : '現在の計画を基準線として記録し、以後の変更と比較表示します'}
      >
        {hasBaseline ? '📏 基準線クリア' : '📏 基準線を記録'}
      </button>

      <div className={styles.separator} />

      <button className={styles.button} onClick={onOpenCalendar}>📅 カレンダー設定</button>
      <button className={styles.button} onClick={onOpenExport}>📤 エクスポート…</button>
      <button className={styles.button} onClick={handleExportCSV}>📊 CSV出力</button>
      <button className={styles.button} onClick={handleImportCSVClick}>📥 CSV取込</button>

      <div className={styles.spacer} />

      <div className={styles.searchBox}>
        <span className={styles.searchIcon}>🔍</span>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="タスク検索"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
        {filterText && (
          <button
            className={styles.searchClear}
            onClick={() => setFilterText('')}
            title="検索をクリア"
          >
            ×
          </button>
        )}
      </div>

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
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleCSVFileChange}
      />
    </div>
  );
}
