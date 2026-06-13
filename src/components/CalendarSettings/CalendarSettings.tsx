import { useState } from 'react';
import { useProject } from '../../store/ProjectContext';
import { japaneseHolidays } from '../../utils/jpHolidays';
import styles from './CalendarSettings.module.css';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR + i);

interface CalendarSettingsProps {
  onClose: () => void;
}

export function CalendarSettings({ onClose }: CalendarSettingsProps) {
  const { project, dispatch } = useProject();
  const { calendar } = project;
  const [newHoliday, setNewHoliday] = useState('');
  const [holidayYear, setHolidayYear] = useState(CURRENT_YEAR);

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

  const addJapaneseHolidays = () => {
    const existing = new Set(calendar.holidays);
    const additions = japaneseHolidays(holidayYear)
      .map(h => h.date)
      .filter(d => !existing.has(d));
    if (additions.length === 0) {
      alert(`${holidayYear}年の祝日はすべて登録済みです。`);
      return;
    }
    dispatch({
      type: 'SET_CALENDAR',
      calendar: { ...calendar, holidays: [...calendar.holidays, ...additions].sort() },
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
          <div className={styles.addHolidayRow}>
            <select
              className={styles.dateInput}
              value={holidayYear}
              onChange={e => setHolidayYear(Number(e.target.value))}
            >
              {YEAR_OPTIONS.map(y => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
            <button className={styles.addButton} onClick={addJapaneseHolidays}>
              🎌 日本の祝日を一括追加
            </button>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.closeButton} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
