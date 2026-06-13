/**
 * 日本の国民の祝日を算出する（2020年以降の制度を前提）。
 * - 固定祝日・ハッピーマンデー・春分/秋分（近似式）に対応
 * - 振替休日（祝日が日曜の場合は次の非祝日平日）
 * - 国民の休日（祝日に挟まれた平日）
 * 注: 2019年以前やオリンピック特例年（2020/2021）は対象外。
 */

export interface JapaneseHoliday {
  date: string; // yyyy-MM-dd
  name: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function weekday(y: number, m: number, d: number): number {
  // UTC で計算しタイムゾーンの影響を避ける（0=日曜）
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** その月の n 番目の月曜の「日」を返す */
function nthMonday(y: number, m: number, n: number): number {
  const firstDow = weekday(y, m, 1);
  const offsetToMonday = (1 - firstDow + 7) % 7;
  return 1 + offsetToMonday + (n - 1) * 7;
}

/** 春分の日（1980〜2099 で有効な近似式） */
function springEquinoxDay(y: number): number {
  return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

/** 秋分の日（1980〜2099 で有効な近似式） */
function autumnEquinoxDay(y: number): number {
  return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

function addDayStr(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function dowOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return weekday(y, m, d);
}

/** 指定年の国民の祝日（振替・国民の休日を含む）を日付順で返す */
export function japaneseHolidays(year: number): JapaneseHoliday[] {
  const base: JapaneseHoliday[] = [
    { date: ymd(year, 1, 1), name: '元日' },
    { date: ymd(year, 1, nthMonday(year, 1, 2)), name: '成人の日' },
    { date: ymd(year, 2, 11), name: '建国記念の日' },
    { date: ymd(year, 2, 23), name: '天皇誕生日' },
    { date: ymd(year, 3, springEquinoxDay(year)), name: '春分の日' },
    { date: ymd(year, 4, 29), name: '昭和の日' },
    { date: ymd(year, 5, 3), name: '憲法記念日' },
    { date: ymd(year, 5, 4), name: 'みどりの日' },
    { date: ymd(year, 5, 5), name: 'こどもの日' },
    { date: ymd(year, 7, nthMonday(year, 7, 3)), name: '海の日' },
    { date: ymd(year, 8, 11), name: '山の日' },
    { date: ymd(year, 9, nthMonday(year, 9, 3)), name: '敬老の日' },
    { date: ymd(year, 9, autumnEquinoxDay(year)), name: '秋分の日' },
    { date: ymd(year, 10, nthMonday(year, 10, 2)), name: 'スポーツの日' },
    { date: ymd(year, 11, 3), name: '文化の日' },
    { date: ymd(year, 11, 23), name: '勤労感謝の日' },
  ];

  base.sort((a, b) => a.date.localeCompare(b.date));
  const holidaySet = new Set(base.map(h => h.date));
  const extras: JapaneseHoliday[] = [];

  // 国民の休日: 前後を祝日に挟まれた平日（日曜以外）
  for (let i = 0; i < base.length - 1; i++) {
    const a = base[i].date;
    const b = base[i + 1].date;
    const mid = addDayStr(a, 1);
    if (addDayStr(mid, 1) === b && !holidaySet.has(mid) && dowOf(mid) !== 0) {
      extras.push({ date: mid, name: '国民の休日' });
      holidaySet.add(mid);
    }
  }

  // 振替休日: 祝日が日曜なら、次の非祝日を振替に
  for (const h of base) {
    if (dowOf(h.date) === 0) {
      let sub = addDayStr(h.date, 1);
      while (holidaySet.has(sub)) sub = addDayStr(sub, 1);
      extras.push({ date: sub, name: '振替休日' });
      holidaySet.add(sub);
    }
  }

  return [...base, ...extras].sort((a, b) => a.date.localeCompare(b.date));
}

/** startYear〜endYear（両端含む）の祝日をまとめて返す */
export function japaneseHolidaysInRange(startYear: number, endYear: number): JapaneseHoliday[] {
  const result: JapaneseHoliday[] = [];
  for (let y = startYear; y <= endYear; y++) {
    result.push(...japaneseHolidays(y));
  }
  return result;
}
