import { useState } from 'react';
import { useProject } from '../../store/ProjectContext';
import styles from './CalendarSettings.module.css';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface CalendarSettingsProps {
  onClose: () => void;
}

export function CalendarSettings({ onClose }: CalendarSettingsProps) {
  const { project, dispatch } = useProject();
  const { calendar } = project;
  const [newHoliday, setNewHoliday] = useState('');

  const toggleDay = (day: number) => {
    const workingDays = calendar.workingDays.includes(day)
      ? calendar.workingDays.filter(d => d !== day)
      : [...calendar.workingDays, day].sort();
    dispatch({ type: 'SET_CALENDAR', calendar: { ...calendar, workingDays } });
  };

  const addHoliday = () => {
    if (!newHoliday) return;
    if (calendar.holidays.includes(newHoliday)) return;
    dispatch({
      type: 'SET_CALENDAR',
      calendar: { ...calendar, holidays: [...calendar.holidays, newHoliday].sort() },
    });
    setNewHoliday('');
  };

  const removeHoliday = (date: string) => {
    dispatch({
      type: 'SET_CALENDAR',
      calendar: { ...calendar, holidays: calendar.holidays.filter(h => h !== date) },
    });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>カレンダー設定</h2>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>稼働日</div>
          <div className={styles.dayGrid}>
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                className={`${styles.dayButton} ${calendar.workingDays.includes(i) ? styles.active : ''}`}
                onClick={() => toggleDay(i)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>休日</div>
          <div className={styles.holidayList}>
            {calendar.holidays.map(date => (
              <div key={date} className={styles.holidayItem}>
                <span>{date}</span>
                <button className={styles.removeButton} onClick={() => removeHoliday(date)}>×</button>
              </div>
            ))}
          </div>
          <div className={styles.addHolidayRow}>
            <input
              type="date"
              className={styles.dateInput}
              value={newHoliday}
              onChange={e => setNewHoliday(e.target.value)}
            />
            <button className={styles.addButton} onClick={addHoliday}>追加</button>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.closeButton} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
