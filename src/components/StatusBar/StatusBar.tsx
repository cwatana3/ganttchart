import { useProject } from '../../store/ProjectContext';
import styles from './StatusBar.module.css';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export function StatusBar() {
  const { project } = useProject();
  const workingDaysStr = project.calendar.workingDays
    .map(d => DAY_LABELS[d])
    .join('・');

  return (
    <div className={styles.statusBar}>
      <span>プロジェクト: {project.name}</span>
      <div className={styles.item}>
        <span>全タスク: {project.tasks.length}件</span>
        <span>稼働日: {workingDaysStr}</span>
      </div>
    </div>
  );
}
