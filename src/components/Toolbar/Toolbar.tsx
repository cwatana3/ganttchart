import { useRef } from 'react';
import { useProject } from '../../store/ProjectContext';
import { useTheme } from '../../store/ThemeContext';
import { importFromJSON, exportToJSON } from '../../utils/export';
import { exportTasksToCSV, parseTasksFromCSV } from '../../utils/csv';
import { canIndent, canOutdent } from '../../utils/taskTree';
import {
  IconNewProject, IconDuplicate, IconTrash, IconOpen, IconSave,
  IconUndo, IconRedo, IconAddTask, IconOutdent, IconIndent,
  IconCopy, IconCut, IconPaste, IconToday, IconLink, IconCritical,
  IconBaseline, IconCalendar, IconExport, IconCsvDown, IconCsvUp,
  IconHistory, IconSearch, IconSun, IconMoon, IconClose,
} from './icons';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  onOpenCalendar: () => void;
  onOpenExport: () => void;
  onOpenBackup: () => void;
  onToday?: () => void;
}

export function Toolbar({ onOpenCalendar, onOpenExport, onOpenBackup, onToday }: ToolbarProps) {
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
      {/* プロジェクト切替 */}
      <div className={styles.group}>
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
        <button className={styles.iconBtn} onClick={createProject} title="新規プロジェクト"><IconNewProject /></button>
        <button className={styles.iconBtn} onClick={duplicateProject} title="プロジェクトを複製"><IconDuplicate /></button>
        <button
          className={styles.iconBtn}
          onClick={handleDeleteProject}
          disabled={projectList.length <= 1}
          title="プロジェクトを削除"
        >
          <IconTrash />
        </button>
      </div>

      {/* ファイル入出力（JSON） */}
      <div className={styles.group}>
        <button className={styles.iconBtn} onClick={handleOpen} title="JSONを開く"><IconOpen /></button>
        <button className={styles.iconBtn} onClick={handleSave} title="JSONを保存"><IconSave /></button>
      </div>

      {/* 取り消し／やり直し */}
      <div className={styles.group}>
        <button className={styles.iconBtn} onClick={undo} disabled={!canUndo} title="元に戻す (Ctrl+Z)"><IconUndo /></button>
        <button className={styles.iconBtn} onClick={redo} disabled={!canRedo} title="やり直す (Ctrl+Y)"><IconRedo /></button>
      </div>

      {/* タスク編集 */}
      <div className={styles.group}>
        <button className={styles.iconBtn} onClick={handleAddTask} title="タスク追加 (Enter)"><IconAddTask /></button>
        <button className={styles.iconBtn} onClick={handleOutdent} disabled={isOutdentDisabled} title="アウトデント (Shift+Tab)"><IconOutdent /></button>
        <button className={styles.iconBtn} onClick={handleIndent} disabled={isIndentDisabled} title="インデント (Tab)"><IconIndent /></button>
      </div>

      {/* クリップボード */}
      <div className={styles.group}>
        <button className={styles.iconBtn} onClick={() => selectedTaskId && copyTask(selectedTaskId)} disabled={!selectedTaskId} title="コピー (Ctrl+C)"><IconCopy /></button>
        <button className={styles.iconBtn} onClick={() => selectedTaskId && cutTask(selectedTaskId)} disabled={!selectedTaskId} title="切り取り (Ctrl+X)"><IconCut /></button>
        <button className={styles.iconBtn} onClick={pasteTask} disabled={!canPaste} title="貼り付け (Ctrl+V)"><IconPaste /></button>
        <button className={styles.iconBtn} onClick={handleDeleteTask} disabled={selectedTaskIds.length === 0} title="削除 (Delete)"><IconTrash /></button>
      </div>

      {/* 時間軸 */}
      <div className={styles.segmented}>
        <button className={`${styles.segBtn} ${viewMode === 'day' ? styles.segActive : ''}`} onClick={() => setViewMode('day')}>日</button>
        <button className={`${styles.segBtn} ${viewMode === 'week' ? styles.segActive : ''}`} onClick={() => setViewMode('week')}>週</button>
        <button className={`${styles.segBtn} ${viewMode === 'month' ? styles.segActive : ''}`} onClick={() => setViewMode('month')}>月</button>
      </div>
      <button className={styles.iconBtn} onClick={onToday} title="今日の位置へスクロール"><IconToday /></button>

      {/* 表示トグル */}
      <div className={styles.group}>
        <button
          className={`${styles.iconBtn} ${project.autoSchedule ? styles.on : ''}`}
          onClick={() => dispatch({ type: 'SET_AUTO_SCHEDULE', enabled: !project.autoSchedule })}
          title={project.autoSchedule ? '自動配置: ON（依存に基づき後続を自動で後送り）' : '自動配置: OFF'}
        >
          <IconLink />
        </button>
        <button
          className={`${styles.iconBtn} ${showCriticalPath ? styles.on : ''}`}
          onClick={() => setShowCriticalPath(v => !v)}
          title="クリティカルパスを強調表示"
        >
          <IconCritical />
        </button>
        <button
          className={`${styles.iconBtn} ${hasBaseline ? styles.on : ''}`}
          onClick={handleBaseline}
          title={hasBaseline ? '基準線をクリア' : '現在の計画を基準線として記録'}
        >
          <IconBaseline />
        </button>
      </div>

      {/* 設定・エクスポート */}
      <div className={styles.group}>
        <button className={styles.iconBtn} onClick={onOpenCalendar} title="カレンダー設定"><IconCalendar /></button>
        <button className={styles.iconBtn} onClick={onOpenExport} title="エクスポート（SVG / PNG / 印刷）"><IconExport /></button>
        <button className={styles.iconBtn} onClick={handleExportCSV} title="CSV出力"><IconCsvDown /></button>
        <button className={styles.iconBtn} onClick={handleImportCSVClick} title="CSV取込"><IconCsvUp /></button>
        <button className={styles.iconBtn} onClick={onOpenBackup} title="自動バックアップから復元"><IconHistory /></button>
      </div>

      <div className={styles.spacer} />

      <div className={styles.searchBox}>
        <span className={styles.searchIcon}><IconSearch /></span>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="タスク検索"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
        {filterText && (
          <button className={styles.searchClear} onClick={() => setFilterText('')} title="検索をクリア">
            <IconClose />
          </button>
        )}
      </div>

      <button
        className={styles.iconBtn}
        onClick={toggleTheme}
        title={light ? 'ダークモードに切替' : 'ライトモードに切替'}
      >
        {light ? <IconSun /> : <IconMoon />}
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
