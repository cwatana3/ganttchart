# ガントチャートツール 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React + TypeScript + Vite で動作するブラウザベースのガントチャートSPAを構築する。タスク階層構造、カレンダー設定、マイルストーン、SVGエクスポートを備える。

**Architecture:** React状態管理（useReducer + Context）でタスク・カレンダーを管理し、IndexedDB（idb）でデータ永続化。ガントチャートはカスタムSVGで描画し、XMLSerializerでエクスポート。Cloudflare Pagesに静的にデプロイ。

**Tech Stack:** React 18, TypeScript 5, Vite 6, idb 8, date-fns 4, CSS Modules, Vitest

**設計からの変更点:** frappe-gantt はマイルストーン・タスク階層のネイティブサポートがなく、SVGエクスポート制御のため、ガントチャートはカスタムSVGで自前実装する。

---

## ファイル構成（全体像）

```
gannt/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── .gitignore
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.module.css
│   ├── index.css                     # グローバルスタイル（リセット等）
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── calendar.ts
│   │   ├── calendar.test.ts
│   │   ├── taskTree.ts
│   │   ├── taskTree.test.ts
│   │   └── export.ts
│   ├── store/
│   │   └── ProjectContext.tsx
│   └── components/
│       ├── Toolbar/
│       │   ├── Toolbar.tsx
│       │   └── Toolbar.module.css
│       ├── TaskTable/
│       │   ├── TaskTable.tsx
│       │   ├── TaskRow.tsx
│       │   └── TaskTable.module.css
│       ├── GanttView/
│       │   ├── GanttView.tsx
│       │   └── GanttView.module.css
│       ├── CalendarSettings/
│       │   ├── CalendarSettings.tsx
│       │   └── CalendarSettings.module.css
│       ├── SplitPane/
│       │   ├── SplitPane.tsx
│       │   └── SplitPane.module.css
│       └── StatusBar/
│           ├── StatusBar.tsx
│           └── StatusBar.module.css
└── public/
    └── favicon.svg
```

---

### Task 1: プロジェクトの初期化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Modify: `.gitignore`

- [ ] **Step 1: package.json を作成**

```json
{
  "name": "gannt",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "idb": "^8.0.0",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: tsconfig.json を作成**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: tsconfig.node.json を作成**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: vite.config.ts を作成**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
  },
});
```

- [ ] **Step 5: index.html を作成**

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gannt - Gantt Chart Tool</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: public/favicon.svg を作成**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="2" y="10" width="12" height="12" rx="2" fill="#4a90d9"/>
  <rect x="16" y="18" width="14" height="4" rx="2" fill="#e8a838"/>
  <polygon points="22,6 28,14 16,14" fill="#e8a838"/>
</svg>
```

- [ ] **Step 7: 依存関係をインストール**

```bash
npm install
```

- [ ] **Step 8: コミット**

```bash
git add .
git commit -m "chore: scaffold Vite + React + TypeScript project"
```

---

### Task 2: 型定義

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: 型定義ファイルを作成**

```typescript
export interface Calendar {
  workingDays: number[];  // 0=日曜, 1=月曜... デフォルト [1,2,3,4,5]
  holidays: string[];     // YYYY-MM-DD 形式のカスタム休日
}

export interface Task {
  id: string;
  name: string;
  startDate: string;     // YYYY-MM-DD
  endDate: string;       // YYYY-MM-DD
  duration: number;      // 稼働日数（milestoneの場合は0）
  parentId: string | null;
  isMilestone: boolean;
  progress: number;      // 0-100
  collapsed: boolean;    // サマリータスクの折りたたみ状態
}

export interface Project {
  name: string;
  calendar: Calendar;
  tasks: Task[];
}

export type ProjectAction =
  | { type: 'LOAD_PROJECT'; project: Project }
  | { type: 'SET_PROJECT_NAME'; name: string }
  | { type: 'SET_CALENDAR'; calendar: Calendar }
  | { type: 'ADD_TASK'; parentId: string | null; afterId?: string }
  | { type: 'DELETE_TASK'; id: string }
  | { type: 'UPDATE_TASK'; id: string; changes: Partial<Task> }
  | { type: 'INDENT_TASK'; id: string }
  | { type: 'OUTDENT_TASK'; id: string }
  | { type: 'MOVE_TASK'; id: string; direction: 'up' | 'down' }
  | { type: 'TOGGLE_COLLAPSE'; id: string };

export function createDefaultCalendar(): Calendar {
  return {
    workingDays: [1, 2, 3, 4, 5], // 月-金
    holidays: [],
  };
}

export function createDefaultProject(): Project {
  return {
    name: '新規プロジェクト',
    calendar: createDefaultCalendar(),
    tasks: [],
  };
}
```

- [ ] **Step 2: 型チェックが通ることを確認**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: コミット**

```bash
git add src/types/index.ts
git commit -m "feat: add TypeScript type definitions"
```

---

### Task 3: カレンダー計算ユーティリティ

**Files:**
- Create: `src/utils/calendar.ts`
- Create: `src/utils/calendar.test.ts`

- [ ] **Step 1: calendar.test.ts を作成（テストファースト）**

```typescript
import { describe, it, expect } from 'vitest';
import {
  isWorkingDay,
  addWorkingDays,
  countWorkingDays,
  getWorkingDaysBetween,
} from './calendar';
import type { Calendar } from '../types';

const defaultCalendar: Calendar = {
  workingDays: [1, 2, 3, 4, 5], // 月-金
  holidays: [],
};

const calendarWithHolidays: Calendar = {
  workingDays: [1, 2, 3, 4, 5],
  holidays: ['2026-06-15', '2026-06-16'],
};

describe('isWorkingDay', () => {
  it('returns true for Monday (2026-06-08)', () => {
    expect(isWorkingDay('2026-06-08', defaultCalendar)).toBe(true);
  });

  it('returns false for Saturday (2026-06-13)', () => {
    expect(isWorkingDay('2026-06-13', defaultCalendar)).toBe(false);
  });

  it('returns false for Sunday (2026-06-14)', () => {
    expect(isWorkingDay('2026-06-14', defaultCalendar)).toBe(false);
  });

  it('returns false for holiday', () => {
    expect(isWorkingDay('2026-06-15', calendarWithHolidays)).toBe(false);
  });
});

describe('addWorkingDays', () => {
  it('adds 1 working day (Monday to Tuesday)', () => {
    expect(addWorkingDays('2026-06-08', 1, defaultCalendar)).toBe('2026-06-09');
  });

  it('skips weekend when adding 5 days from Monday', () => {
    expect(addWorkingDays('2026-06-08', 5, defaultCalendar)).toBe('2026-06-15');
  });

  it('skips holidays', () => {
    expect(addWorkingDays('2026-06-12', 2, calendarWithHolidays)).toBe('2026-06-18');
  });

  it('returns same date for duration 0', () => {
    expect(addWorkingDays('2026-06-08', 0, defaultCalendar)).toBe('2026-06-08');
  });
});

describe('countWorkingDays', () => {
  it('counts 5 working days in a full week', () => {
    expect(countWorkingDays('2026-06-08', '2026-06-14', defaultCalendar)).toBe(5);
  });

  it('counts 0 for same start and end', () => {
    expect(countWorkingDays('2026-06-08', '2026-06-08', defaultCalendar)).toBe(0);
  });

  it('skips holidays in count', () => {
    expect(countWorkingDays('2026-06-15', '2026-06-17', calendarWithHolidays)).toBe(1);
  });
});

describe('getWorkingDaysBetween', () => {
  it('returns date strings for working days in range', () => {
    const days = getWorkingDaysBetween('2026-06-08', '2026-06-10', defaultCalendar);
    expect(days).toEqual(['2026-06-08', '2026-06-09', '2026-06-10']);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
npx vitest run src/utils/calendar.test.ts
```

Expected: 全テストが FAIL（モジュール未作成）

- [ ] **Step 3: calendar.ts を実装**

```typescript
import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns';
import type { Calendar } from '../types';

export function toDate(dateStr: string): Date {
  return parseISO(dateStr);
}

export function fromDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function isWorkingDay(dateStr: string, calendar: Calendar): boolean {
  const date = toDate(dateStr);
  const dayOfWeek = getDay(date); // 0=日曜
  if (!calendar.workingDays.includes(dayOfWeek)) return false;
  if (calendar.holidays.includes(dateStr)) return false;
  return true;
}

/**
 * startDate から duration 稼働日だけ進めた日付を返す。
 * startDate 自体はカウントに含めない。
 * duration = 0 の場合は startDate をそのまま返す。
 */
export function addWorkingDays(startDateStr: string, duration: number, calendar: Calendar): string {
  if (duration <= 0) return startDateStr;

  let current = toDate(startDateStr);
  let remaining = duration;

  while (remaining > 0) {
    current = addDays(current, 1);
    if (isWorkingDay(fromDate(current), calendar)) {
      remaining--;
    }
  }

  return fromDate(current);
}

/**
 * startDateStr から endDateStr までの稼働日数を返す。
 * startDateStr と endDateStr が同じ場合は 0 を返す。
 * endDate が startDate より前の場合は負の数を返す。
 */
export function countWorkingDays(startDateStr: string, endDateStr: string, calendar: Calendar): number {
  const start = toDate(startDateStr);
  const end = toDate(endDateStr);
  const totalDays = differenceInCalendarDays(end, start);

  if (totalDays === 0) return 0;

  const direction = totalDays > 0 ? 1 : -1;
  let count = 0;
  let current = start;

  for (let i = 0; i < Math.abs(totalDays); i++) {
    current = addDays(current, direction);
    if (isWorkingDay(fromDate(current), calendar)) {
      count += direction;
    }
  }

  return count;
}

/**
 * startDateStr から endDateStr の間の稼働日一覧を文字列配列で返す。
 * startDate, endDate を含む。
 */
export function getWorkingDaysBetween(startDateStr: string, endDateStr: string, calendar: Calendar): string[] {
  const start = toDate(startDateStr);
  const end = toDate(endDateStr);
  const totalDays = differenceInCalendarDays(end, start);
  const result: string[] = [];

  let current = start;
  for (let i = 0; i <= totalDays; i++) {
    const dateStr = fromDate(current);
    if (isWorkingDay(dateStr, calendar)) {
      result.push(dateStr);
    }
    current = addDays(current, 1);
  }

  return result;
}
```

- [ ] **Step 4: テストを実行して通過を確認**

```bash
npx vitest run src/utils/calendar.test.ts
```

Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/calendar.ts src/utils/calendar.test.ts
git commit -m "feat: add calendar working-day calculation utilities"
```

---

### Task 4: タスク階層操作ユーティリティ

**Files:**
- Create: `src/utils/taskTree.ts`
- Create: `src/utils/taskTree.test.ts`

- [ ] **Step 1: taskTree.test.ts を作成**

```typescript
import { describe, it, expect } from 'vitest';
import {
  getChildren,
  getDescendants,
  getSiblings,
  getPreviousSibling,
  getNextSibling,
  getMaxDepth,
  getVisibleTasks,
  getFlattenedTasks,
  canIndent,
  canOutdent,
} from './taskTree';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    name: overrides.id,
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    duration: 5,
    parentId: null,
    isMilestone: false,
    progress: 0,
    collapsed: false,
    ...overrides,
  };
}

const tasks: Task[] = [
  makeTask({ id: '1' }),
  makeTask({ id: '2', parentId: '1' }),
  makeTask({ id: '3', parentId: '1' }),
  makeTask({ id: '4', parentId: '2' }),
  makeTask({ id: '5' }),
];

describe('getChildren', () => {
  it('returns direct children', () => {
    const children = getChildren('1', tasks);
    expect(children.map(t => t.id)).toEqual(['2', '3']);
  });

  it('returns empty array for leaf task', () => {
    expect(getChildren('5', tasks)).toHaveLength(0);
  });
});

describe('getDescendants', () => {
  it('returns all descendants', () => {
    const desc = getDescendants('1', tasks);
    expect(desc.map(t => t.id).sort()).toEqual(['2', '3', '4']);
  });
});

describe('getSiblings', () => {
  it('returns siblings excluding self', () => {
    const sibs = getSiblings('2', tasks);
    expect(sibs.map(t => t.id)).toEqual(['3']);
  });
});

describe('getPreviousSibling', () => {
  it('returns previous sibling', () => {
    expect(getPreviousSibling('3', tasks)?.id).toBe('2');
  });

  it('returns null for first child', () => {
    expect(getPreviousSibling('2', tasks)).toBeNull();
  });
});

describe('getNextSibling', () => {
  it('returns next sibling', () => {
    expect(getNextSibling('2', tasks)?.id).toBe('3');
  });

  it('returns null for last child', () => {
    expect(getNextSibling('3', tasks)).toBeNull();
  });
});

describe('getMaxDepth', () => {
  it('returns max nesting depth', () => {
    expect(getMaxDepth(tasks)).toBe(3);
  });
});

describe('getVisibleTasks', () => {
  it('shows all tasks when nothing collapsed', () => {
    expect(getVisibleTasks(tasks).length).toBe(5);
  });

  it('hides children when parent collapsed', () => {
    const withCollapsed = tasks.map(t =>
      t.id === '1' ? { ...t, collapsed: true } : t
    );
    const visible = getVisibleTasks(withCollapsed);
    expect(visible.map(t => t.id)).toEqual(['1', '5']);
  });
});

describe('getFlattenedTasks', () => {
  it('returns tasks in depth-first order', () => {
    const flat = getFlattenedTasks(tasks);
    expect(flat.map(t => t.id)).toEqual(['1', '2', '4', '3', '5']);
  });
});

describe('canIndent', () => {
  it('allows indent under previous sibling', () => {
    expect(canIndent('3', tasks)).toBe(true);
  });

  it('disallows indent for first child', () => {
    expect(canIndent('2', tasks)).toBe(false);
  });
});

describe('canOutdent', () => {
  it('allows outdent for child task', () => {
    expect(canOutdent('2', tasks)).toBe(true);
  });

  it('disallows outdent for root task', () => {
    expect(canOutdent('1', tasks)).toBe(false);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
npx vitest run src/utils/taskTree.test.ts
```

Expected: 全テスト FAIL

- [ ] **Step 3: taskTree.ts を実装**

```typescript
import type { Task } from '../types';

export function getChildren(parentId: string, tasks: Task[]): Task[] {
  return tasks.filter(t => t.parentId === parentId);
}

export function getDescendants(parentId: string, tasks: Task[]): Task[] {
  const result: Task[] = [];
  const children = getChildren(parentId, tasks);
  for (const child of children) {
    result.push(child);
    result.push(...getDescendants(child.id, tasks));
  }
  return result;
}

export function getSiblings(taskId: string, tasks: Task[]): Task[] {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return [];
  return tasks.filter(t => t.parentId === task.parentId && t.id !== taskId);
}

export function getPreviousSibling(taskId: string, tasks: Task[]): Task | null {
  const siblings = getSiblings(taskId, tasks);
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;
  const sameParent = tasks.filter(t => t.parentId === task.parentId);
  const idx = sameParent.findIndex(t => t.id === taskId);
  return idx > 0 ? sameParent[idx - 1] : null;
}

export function getNextSibling(taskId: string, tasks: Task[]): Task | null {
  const siblings = getSiblings(taskId, tasks);
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;
  const sameParent = tasks.filter(t => t.parentId === task.parentId);
  const idx = sameParent.findIndex(t => t.id === taskId);
  return idx < sameParent.length - 1 ? sameParent[idx + 1] : null;
}

export function getDepth(taskId: string, tasks: Task[]): number {
  let depth = 0;
  let current = tasks.find(t => t.id === taskId);
  while (current?.parentId) {
    depth++;
    current = tasks.find(t => t.id === current!.parentId);
  }
  return depth;
}

export function getMaxDepth(tasks: Task[]): number {
  return tasks.reduce((max, t) => Math.max(max, getDepth(t.id, tasks) + 1), 0);
}

/**
 * 折りたたまれた親の子を除外した、表示すべきタスクを深さ優先で返す。
 */
export function getVisibleTasks(tasks: Task[]): Task[] {
  const result: Task[] = [];
  const rootTasks = tasks.filter(t => t.parentId === null);

  function walk(taskList: Task[]) {
    for (const task of taskList) {
      result.push(task);
      if (!task.collapsed) {
        walk(getChildren(task.id, tasks));
      }
    }
  }

  walk(rootTasks);
  return result;
}

/**
 * すべてのタスクを深さ優先順（折りたたみ無視）で返す。
 */
export function getFlattenedTasks(tasks: Task[]): Task[] {
  const result: Task[] = [];
  const rootTasks = tasks.filter(t => t.parentId === null);

  function walk(taskList: Task[]) {
    for (const task of taskList) {
      result.push(task);
      walk(getChildren(task.id, tasks));
    }
  }

  walk(rootTasks);
  return result;
}

/**
 * task が1つ前のタスクの子になれるか
 */
export function canIndent(taskId: string, tasks: Task[]): boolean {
  const flat = getFlattenedTasks(tasks);
  const idx = flat.findIndex(t => t.id === taskId);
  if (idx <= 0) return false;
  const prev = flat[idx - 1];
  // 1つ前のタスクの子になれる（同じ親の最初の子は不可）
  return prev.id !== taskId;
}

export function canOutdent(taskId: string, tasks: Task[]): boolean {
  const task = tasks.find(t => t.id === taskId);
  return task !== undefined && task.parentId !== null;
}
```

- [ ] **Step 4: テストを実行して通過を確認**

```bash
npx vitest run src/utils/taskTree.test.ts
```

Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/taskTree.ts src/utils/taskTree.test.ts
git commit -m "feat: add task tree hierarchy utilities"
```

---

### Task 5: プロジェクト状態管理（Context + Reducer）

**Files:**
- Create: `src/store/ProjectContext.tsx`

- [ ] **Step 1: ProjectContext.tsx を作成**

```typescript
import { createContext, useContext, useReducer, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { Project, ProjectAction, Task, Calendar } from '../types';
import { createDefaultProject } from '../types';
import {
  getVisibleTasks,
  getFlattenedTasks,
  getChildren,
  getPreviousSibling,
  canIndent,
  canOutdent,
} from '../utils/taskTree';
import { addWorkingDays, countWorkingDays } from '../utils/calendar';

function generateId(): string {
  return crypto.randomUUID();
}

const STORE_NAME = 'gannt-project';
const DB_NAME = 'gannt-db';

// IndexedDB 永続化
async function saveToIndexedDB(project: Project): Promise<void> {
  const { openDB } = await import('idb');
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('projects');
    },
  });
  await db.put('projects', project, STORE_NAME);
  db.close();
}

async function loadFromIndexedDB(): Promise<Project | null> {
  try {
    const { openDB } = await import('idb');
    const db = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('projects');
      },
    });
    const project = await db.get('projects', STORE_NAME);
    db.close();
    return project ?? null;
  } catch {
    return null;
  }
}

function projectReducer(state: Project, action: ProjectAction): Project {
  switch (action.type) {
    case 'LOAD_PROJECT':
      return action.project;

    case 'SET_PROJECT_NAME':
      return { ...state, name: action.name };

    case 'SET_CALENDAR':
      return { ...state, calendar: action.calendar };

    case 'ADD_TASK': {
      const newTask: Task = {
        id: generateId(),
        name: '新規タスク',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
        duration: 1,
        parentId: action.parentId,
        isMilestone: false,
        progress: 0,
        collapsed: false,
      };
      // endDate を calendar に基づいて計算
      newTask.endDate = addWorkingDays(newTask.startDate, 1, state.calendar);
      newTask.duration = 1;

      const tasks = [...state.tasks];

      if (action.afterId) {
        const afterIdx = tasks.findIndex(t => t.id === action.afterId);
        const siblings = tasks.filter(t => t.parentId === action.parentId);
        const afterSiblingIdx = siblings.findIndex(t => t.id === action.afterId);
        const insertIdx = afterIdx + getChildren(action.afterId, tasks).length + 1 +
          (afterSiblingIdx < siblings.length - 1 ? 0 : 0);

        // シンプルに: 同じ親のタスク群の中で afterId の直後に挿入
        const sameParentTasks = tasks.filter(t => t.parentId === action.parentId);
        const afterPos = sameParentTasks.findIndex(t => t.id === action.afterId);
        const allTasksWithoutNew = tasks;

        // 実際の挿入位置を計算: afterId のタスク + その子孫すべての後ろ
        let insertPos = taskIndexInFlat(allTasksWithoutNew, action.afterId);
        const descendants = getChildren(action.afterId, allTasksWithoutNew);
        // 後続の兄弟の前まで
        while (insertPos < allTasksWithoutNew.length - 1) {
          insertPos++;
          const next = allTasksWithoutNew[insertPos];
          // 親が違うか、同じ親でも afterId の後続なら止める
          break;
        }
        insertPos = afterPos === sameParentTasks.length - 1
          ? allTasksWithoutNew.length
          : allTasksWithoutNew.findIndex(t => t.id === sameParentTasks[afterPos + 1].id);

        tasks.splice(insertPos, 0, newTask);
      } else {
        // 親の最後に追加
        if (action.parentId) {
          const parentIdx = tasks.findIndex(t => t.id === action.parentId);
          const descendants = getChildren(action.parentId, tasks);
          const lastDescendantIdx = descendants.length > 0
            ? tasks.findIndex(t => t.id === descendants[descendants.length - 1].id)
            : parentIdx;
          // 追加位置を計算（子の最後に）
          const children = getChildren(action.parentId, tasks);
          const lastChild = children[children.length - 1];
          const lastChildIdx = lastChild
            ? findLastDescendantIndex(tasks, lastChild.id)
            : parentIdx;
          tasks.splice(lastChildIdx + 1, 0, newTask);
        } else {
          tasks.push(newTask);
        }
      }

      return { ...state, tasks };
    }

    case 'DELETE_TASK': {
      const idsToDelete = new Set([action.id]);
      for (const desc of getChildren(action.id, state.tasks)) {
        idsToDelete.add(desc.id);
        for (const sub of getChildren(desc.id, state.tasks)) {
          idsToDelete.add(sub.id);
        }
      }
      return { ...state, tasks: state.tasks.filter(t => !idsToDelete.has(t.id)) };
    }

    case 'UPDATE_TASK': {
      const tasks = state.tasks.map(t => {
        if (t.id !== action.id) return t;
        const updated = { ...t, ...action.changes };

        // マイルストーンの場合 duration=0, endDate=startDate
        if (updated.isMilestone) {
          updated.duration = 0;
          updated.endDate = updated.startDate;
        }
        // duration が変更されたら endDate を再計算
        else if (action.changes.duration !== undefined && !action.changes.endDate) {
          updated.endDate = addWorkingDays(updated.startDate, updated.duration, state.calendar);
        }
        // startDate が変更されたら endDate を duration から再計算
        else if (action.changes.startDate !== undefined && !action.changes.endDate) {
          updated.endDate = addWorkingDays(updated.startDate, updated.duration, state.calendar);
        }

        return updated;
      });
      return { ...state, tasks };
    }

    case 'INDENT_TASK': {
      if (!canIndent(action.id, state.tasks)) return state;
      const flat = getFlattenedTasks(state.tasks);
      const idx = flat.findIndex(t => t.id === action.id);
      const prev = flat[idx - 1];
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === action.id ? { ...t, parentId: prev.id } : t
        ),
      };
    }

    case 'OUTDENT_TASK': {
      if (!canOutdent(action.id, state.tasks)) return state;
      const task = state.tasks.find(t => t.id === action.id)!;
      const parent = state.tasks.find(t => t.id === task.parentId)!;
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === action.id ? { ...t, parentId: parent.parentId } : t
        ),
      };
    }

    case 'MOVE_TASK': {
      const flat = getVisibleTasks(state.tasks);
      const idx = flat.findIndex(t => t.id === action.id);
      if (idx < 0) return state;

      const targetIdx = action.direction === 'up' ? idx : idx + 1;
      if (targetIdx < 0 || targetIdx >= flat.length) return state;

      const target = flat[targetIdx];
      const task = state.tasks.find(t => t.id === action.id)!;

      // 簡易実装: 配列内の位置を入れ替え
      const tasks = [...state.tasks];
      const taskArrIdx = tasks.findIndex(t => t.id === action.id);
      const targetArrIdx = tasks.findIndex(t => t.id === target.id);

      // 子孫タスクも一緒に移動
      const idsToMove = new Set([action.id]);
      const descendants = getChildren(action.id, tasks);

      // 深さ優先ですべての子孫を収集
      function collectDescendants(taskId: string) {
        for (const child of getChildren(taskId, tasks)) {
          idsToMove.add(child.id);
          collectDescendants(child.id);
        }
      }
      collectDescendants(action.id);

      const toMove = tasks.filter(t => idsToMove.has(t.id));
      const rest = tasks.filter(t => !idsToMove.has(t.id));

      const insertIdx = rest.findIndex(t => t.id === target.id);
      const newTasks = [
        ...rest.slice(0, action.direction === 'up' ? insertIdx : insertIdx + 1),
        ...toMove,
        ...rest.slice(action.direction === 'up' ? insertIdx : insertIdx + 1),
      ];

      return { ...state, tasks: newTasks };
    }

    case 'TOGGLE_COLLAPSE':
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === action.id ? { ...t, collapsed: !t.collapsed } : t
        ),
      };

    default:
      return state;
  }
}

function findLastDescendantIndex(tasks: Task[], taskId: string): number {
  const children = getChildren(taskId, tasks);
  if (children.length === 0) return tasks.findIndex(t => t.id === taskId);
  const lastChild = children[children.length - 1];
  return findLastDescendantIndex(tasks, lastChild.id);
}

function taskIndexInFlat(tasks: Task[], taskId: string): number {
  return getFlattenedTasks(tasks).findIndex(t => t.id === taskId);
}

interface ProjectContextValue {
  project: Project;
  dispatch: React.Dispatch<ProjectAction>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, dispatch] = useReducer(projectReducer, createDefaultProject());
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    loadFromIndexedDB().then(saved => {
      if (saved) {
        dispatch({ type: 'LOAD_PROJECT', project: saved });
      }
    });
  }, []);

  // 自動保存（project が変わるたびに IndexedDB に保存）
  useEffect(() => {
    if (!loaded.current) return;
    const timer = setTimeout(() => {
      saveToIndexedDB(project);
    }, 500); // デバウンス 500ms
    return () => clearTimeout(timer);
  }, [project]);

  return (
    <ProjectContext.Provider value={{ project, dispatch }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}

export { projectReducer };
```

- [ ] **Step 2: 型チェックを実行**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: コミット**

```bash
git add src/store/ProjectContext.tsx
git commit -m "feat: add project state management with IndexedDB persistence"
```

---

### Task 6: エクスポートユーティリティ

**Files:**
- Create: `src/utils/export.ts`

- [ ] **Step 1: export.ts を作成**

```typescript
import type { Project } from '../types';

export function exportToJSON(project: Project): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `${project.name}.json`);
}

export function exportToSVG(svgElement: SVGSVGElement, filename: string): void {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  // スタイルをインライン化（getComputedStyleをSVGに埋め込む）
  const originalElements = svgElement.querySelectorAll('*');
  const clonedElements = clone.querySelectorAll('*');

  // SVG要素にXML名前空間とサイズを設定
  const rect = svgElement.getBoundingClientRect();
  clone.setAttribute('width', String(rect.width));
  clone.setAttribute('height', String(rect.height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  downloadBlob(blob, `${filename}.svg`);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importFromJSON(file: File): Promise<Project> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = JSON.parse(reader.result as string) as Project;
        resolve(project);
      } catch (e) {
        reject(new Error('ファイルの解析に失敗しました'));
      }
    };
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsText(file);
  });
}
```

- [ ] **Step 2: コミット**

```bash
git add src/utils/export.ts
git commit -m "feat: add JSON and SVG export utilities"
```

---

### Task 7: SplitPane コンポーネント

**Files:**
- Create: `src/components/SplitPane/SplitPane.tsx`
- Create: `src/components/SplitPane/SplitPane.module.css`

- [ ] **Step 1: SplitPane.module.css を作成**

```css
.container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.left {
  overflow: auto;
  border-right: 1px solid var(--border-color);
}

.divider {
  width: 4px;
  cursor: col-resize;
  background: var(--border-color);
  flex-shrink: 0;
  transition: background 0.15s;
}

.divider:hover,
.divider:active {
  background: var(--accent-color);
}

.right {
  flex: 1;
  overflow: hidden;
  min-width: 200px;
}
```

- [ ] **Step 2: SplitPane.tsx を作成**

```typescript
import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import styles from './SplitPane.module.css';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
}

export function SplitPane({
  left,
  right,
  defaultLeftWidth = 380,
  minLeftWidth = 200,
}: SplitPaneProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      setLeftWidth(Math.max(minLeftWidth, Math.min(newWidth, rect.width - 200)));
    };

    const onMouseUp = () => {
      dragging.current = false;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [minLeftWidth]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.left} style={{ width: leftWidth, flexShrink: 0 }}>
        {left}
      </div>
      <div className={styles.divider} onMouseDown={onMouseDown} />
      <div className={styles.right}>
        {right}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: コミット**

```bash
git add src/components/SplitPane/
git commit -m "feat: add SplitPane resizable component"
```

---

### Task 8: Toolbar コンポーネント

**Files:**
- Create: `src/components/Toolbar/Toolbar.tsx`
- Create: `src/components/Toolbar/Toolbar.module.css`

- [ ] **Step 1: Toolbar.module.css を作成**

```css
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.separator {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  margin: 0 4px;
}

.button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.button:hover {
  background: var(--hover-bg);
}

.button:active {
  background: var(--active-bg);
}

.spacer {
  flex: 1;
}
```

- [ ] **Step 2: Toolbar.tsx を作成**

```typescript
import { useRef } from 'react';
import { useProject } from '../../store/ProjectContext';
import { importFromJSON, exportToJSON } from '../../utils/export';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  onOpenCalendar: () => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}

export function Toolbar({ onOpenCalendar, svgRef }: ToolbarProps) {
  const { project, dispatch } = useProject();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNew = () => {
    if (confirm('現在のプロジェクトを破棄して新規作成しますか？')) {
      dispatch({ type: 'LOAD_PROJECT', project: { name: '新規プロジェクト', calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [] }, tasks: [] } });
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
    } catch (err) {
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

  const handleDeleteTask = () => {
    // 最後に選択されたタスクを削除（単純化のため最後のタスク）
    if (project.tasks.length > 0) {
      const lastTask = project.tasks[project.tasks.length - 1];
      dispatch({ type: 'DELETE_TASK', id: lastTask.id });
    }
  };

  const handleExportSVG = () => {
    if (svgRef.current) {
      exportToSVG(svgRef.current, project.name);
    }
  };

  return (
    <div className={styles.toolbar}>
      <button className={styles.button} onClick={handleNew}>新規</button>
      <button className={styles.button} onClick={handleOpen}>開く</button>
      <button className={styles.button} onClick={handleSave}>保存</button>

      <div className={styles.separator} />

      <button className={styles.button} onClick={handleAddTask}>+ タスク追加</button>

      <div className={styles.separator} />

      <button className={styles.button} onClick={onOpenCalendar}>カレンダー設定</button>
      <button className={styles.button} onClick={handleExportSVG}>SVG出力</button>

      <div className={styles.spacer} />

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
```

- [ ] **Step 3: コミット**

```bash
git add src/components/Toolbar/
git commit -m "feat: add Toolbar component with file and export actions"
```

---

### Task 9: TaskTable + TaskRow コンポーネント

**Files:**
- Create: `src/components/TaskTable/TaskTable.tsx`
- Create: `src/components/TaskTable/TaskRow.tsx`
- Create: `src/components/TaskTable/TaskTable.module.css`

- [ ] **Step 1: TaskTable.module.css を作成**

```css
.table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.headerRow {
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
}

.headerCell {
  padding: 4px 8px;
  text-align: left;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
  white-space: nowrap;
}

.row {
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}

.row:hover {
  background: var(--hover-bg);
}

.row.selected {
  background: var(--selected-bg);
}

.cell {
  padding: 4px 8px;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.numberCell {
  composes: cell;
  width: 40px;
  text-align: center;
  color: var(--text-muted);
}

.nameCell {
  composes: cell;
}

.durationCell {
  composes: cell;
  width: 60px;
}

.dateCell {
  composes: cell;
  width: 90px;
}

.expandButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  padding: 0;
  margin-right: 2px;
  flex-shrink: 0;
}

.expandButton:hover {
  color: var(--text-color);
}

.taskNameWrapper {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-left: calc(var(--indent, 0) * 16px);
}

.milestoneMark {
  color: var(--milestone-color);
  margin-right: 4px;
}

.editInput {
  width: 100%;
  border: 1px solid var(--accent-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 13px;
  padding: 2px 4px;
  outline: none;
  border-radius: 2px;
}
```

- [ ] **Step 2: TaskRow.tsx を作成**

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import type { Task } from '../../types';
import { useProject } from '../../store/ProjectContext';
import { getDepth } from '../../utils/taskTree';
import styles from './TaskTable.module.css';

interface TaskRowProps {
  task: Task;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export function TaskRow({ task, isSelected, onSelect }: TaskRowProps) {
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
          autoFocus
        />
      );
    }
    return (
      <span
        onClick={() => startEdit(field, value)}
        style={{ cursor: 'text' }}
      >
        {displayValue ?? value}
      </span>
    );
  };

  return (
    <tr
      className={`${styles.row} ${isSelected ? styles.selected : ''}`}
      onClick={() => onSelect(task.id)}
    >
      <td className={styles.cell}>
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
      <td className={styles.durationCell}>
        {renderCell('duration', String(task.duration), `${task.duration}日`)}
      </td>
      <td className={styles.dateCell}>
        {renderCell('startDate', task.startDate)}
      </td>
      <td className={styles.dateCell}>
        {renderCell('endDate', task.endDate)}
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: TaskTable.tsx を作成**

```typescript
import { useState } from 'react';
import { useProject } from '../../store/ProjectContext';
import { getVisibleTasks } from '../../utils/taskTree';
import { TaskRow } from './TaskRow';
import styles from './TaskTable.module.css';

export function TaskTable() {
  const { project } = useProject();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visibleTasks = getVisibleTasks(project.tasks);

  return (
    <table className={styles.table}>
      <thead>
        <tr className={styles.headerRow}>
          <th className={styles.nameCell}>タスク名</th>
          <th className={styles.durationCell}>期間</th>
          <th className={styles.dateCell}>開始日</th>
          <th className={styles.dateCell}>終了日</th>
        </tr>
      </thead>
      <tbody>
        {visibleTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            isSelected={task.id === selectedId}
            onSelect={setSelectedId}
          />
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: コミット**

```bash
git add src/components/TaskTable/
git commit -m "feat: add TaskTable and TaskRow components with inline editing"
```

---

### Task 10: GanttView コンポーネント（SVGベース）

**Files:**
- Create: `src/components/GanttView/GanttView.tsx`
- Create: `src/components/GanttView/GanttView.module.css`

- [ ] **Step 1: GanttView.module.css を作成**

```css
.container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.scrollArea {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.svg {
  /* 高さはタスク数×行の高さ＋ヘッダー */
}

.timelineHeader {
  fill: var(--header-bg);
}

.timelineText {
  fill: var(--text-muted);
  font-size: 11px;
  font-family: system-ui, sans-serif;
}

.gridLine {
  stroke: var(--border-color);
  stroke-width: 0.5;
}

.todayLine {
  stroke: #e74c3c;
  stroke-width: 1.5;
  stroke-dasharray: 4 2;
}

.taskBar {
  fill: #4a90d9;
  rx: 3;
  ry: 3;
  cursor: grab;
}

.taskBar:active {
  cursor: grabbing;
}

.summaryBar {
  fill: #3a5a80;
  rx: 3;
  ry: 3;
}

.milestoneDiamond {
  fill: #e8a838;
}

.rowBgEven {
  fill: transparent;
}

.rowBgOdd {
  fill: rgba(255, 255, 255, 0.02);
}
```

- [ ] **Step 2: GanttView.tsx を作成**

```typescript
import { useMemo, useRef, useCallback } from 'react';
import { useProject } from '../../store/ProjectContext';
import { getVisibleTasks } from '../../utils/taskTree';
import { toDate, fromDate } from '../../utils/calendar';
import { addDays, differenceInCalendarDays } from 'date-fns';
import styles from './GanttView.module.css';

const DAY_WIDTH = 32;
const ROW_HEIGHT = 40;
const BAR_HEIGHT = 20;
const BAR_Y_OFFSET = 10;
const HEADER_HEIGHT = 28;
const MILESTONE_SIZE = 8;

interface GanttViewProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
}

export function GanttView({ svgRef }: GanttViewProps) {
  const { project, dispatch } = useProject();
  const visibleTasks = getVisibleTasks(project.tasks);
  const containerRef = useRef<HTMLDivElement>(null);

  const { minDate, maxDate, totalDays, totalWidth, totalHeight } = useMemo(() => {
    if (visibleTasks.length === 0) {
      const today = new Date();
      return {
        minDate: today,
        maxDate: addDays(today, 30),
        totalDays: 30,
        totalWidth: 30 * DAY_WIDTH + 100,
        totalHeight: HEADER_HEIGHT + ROW_HEIGHT,
      };
    }

    let min = toDate('2099-12-31');
    let max = toDate('2000-01-01');

    for (const task of visibleTasks) {
      const start = toDate(task.startDate);
      const end = toDate(task.endDate);
      if (start < min) min = start;
      if (end > max) max = end;
    }

    // 前後にパディング
    min = addDays(min, -5);
    max = addDays(max, 10);

    const days = differenceInCalendarDays(max, min) + 1;
    const width = days * DAY_WIDTH + 100;
    const height = HEADER_HEIGHT + visibleTasks.length * ROW_HEIGHT + 50;

    return { minDate: min, maxDate: max, totalDays: days, totalWidth: width, totalHeight: height };
  }, [visibleTasks]);

  const getX = useCallback((dateStr: string): number => {
    return differenceInCalendarDays(toDate(dateStr), minDate) * DAY_WIDTH + 50;
  }, [minDate]);

  const scrollToTask = useCallback((taskId: string) => {
    const idx = visibleTasks.findIndex(t => t.id === taskId);
    if (idx >= 0 && containerRef.current) {
      containerRef.current.scrollTop = idx * ROW_HEIGHT;
    }
  }, [visibleTasks]);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.scrollArea}>
        <svg
          ref={svgRef}
          width={totalWidth}
          height={totalHeight}
          className={styles.svg}
        >
          {/* タイムラインヘッダー */}
          <rect x={0} y={0} width={totalWidth} height={HEADER_HEIGHT} className={styles.timelineHeader} />
          {Array.from({ length: totalDays + 1 }, (_, i) => {
            const date = addDays(minDate, i);
            const x = i * DAY_WIDTH + 50;
            const isMonthStart = date.getDate() === 1;
            return (
              <g key={i}>
                <line x1={x} y1={0} x2={x} y2={HEADER_HEIGHT} className={styles.gridLine} />
                {isMonthStart && (
                  <text x={x + 4} y={18} className={styles.timelineText}>
                    {fromDate(date)}
                  </text>
                )}
                {!isMonthStart && date.getDay() === 1 && (
                  <text x={x + 4} y={18} className={styles.timelineText}>
                    {date.getDate()}/{date.getMonth() + 1}
                  </text>
                )}
              </g>
            );
          })}

          {/* 水平グリッド線 */}
          {visibleTasks.map((_, i) => {
            const y = HEADER_HEIGHT + i * ROW_HEIGHT;
            return (
              <line key={i} x1={0} y1={y} x2={totalWidth} y2={y} className={styles.gridLine} />
            );
          })}

          {/* Today線 */}
          {(() => {
            const todayX = getX(todayStr);
            if (todayX >= 0 && todayX <= totalWidth) {
              return (
                <>
                  <line x1={todayX} y1={0} x2={todayX} y2={totalHeight} className={styles.todayLine} />
                  <text x={todayX + 4} y={HEADER_HEIGHT - 4} fill="#e74c3c" fontSize={10} fontFamily="system-ui">
                    今日
                  </text>
                </>
              );
            }
            return null;
          })()}

          {/* タスクバー */}
          {visibleTasks.map((task, i) => {
            const y = HEADER_HEIGHT + i * ROW_HEIGHT + BAR_Y_OFFSET;
            const x1 = getX(task.startDate);
            const x2 = getX(task.endDate);
            const barWidth = Math.max(task.isMilestone ? MILESTONE_SIZE * 2 : 4, x2 - x1);
            const hasChildren = project.tasks.some(t => t.parentId === task.id);

            if (task.isMilestone) {
              const cx = x1;
              const cy = y + BAR_HEIGHT / 2;
              const points = [
                `${cx},${cy - MILESTONE_SIZE}`,
                `${cx + MILESTONE_SIZE},${cy}`,
                `${cx},${cy + MILESTONE_SIZE}`,
                `${cx - MILESTONE_SIZE},${cy}`,
              ].join(' ');
              return (
                <polygon
                  key={task.id}
                  points={points}
                  className={styles.milestoneDiamond}
                />
              );
            }

            return (
              <rect
                key={task.id}
                x={x1}
                y={y}
                width={barWidth}
                height={BAR_HEIGHT}
                className={hasChildren ? styles.summaryBar : styles.taskBar}
                rx={3}
                ry={3}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: コミット**

```bash
git add src/components/GanttView/
git commit -m "feat: add SVG-based GanttView component"
```

---

### Task 11: CalendarSettings ダイアログ

**Files:**
- Create: `src/components/CalendarSettings/CalendarSettings.tsx`
- Create: `src/components/CalendarSettings/CalendarSettings.module.css`

- [ ] **Step 1: CalendarSettings.module.css を作成**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px 24px;
  min-width: 360px;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}

.section {
  margin-bottom: 16px;
}

.sectionLabel {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-muted);
}

.dayGrid {
  display: flex;
  gap: 4px;
}

.dayButton {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dayButton.active {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.holidayList {
  max-height: 120px;
  overflow-y: auto;
  margin-bottom: 8px;
}

.holidayItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.removeButton {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}

.removeButton:hover {
  color: #e74c3c;
}

.addHolidayRow {
  display: flex;
  gap: 8px;
}

.dateInput {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 13px;
}

.addButton {
  padding: 4px 12px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  background: var(--accent-color);
  color: white;
  font-size: 13px;
  cursor: pointer;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.closeButton {
  padding: 6px 16px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
}

.closeButton:hover {
  background: var(--hover-bg);
}
```

- [ ] **Step 2: CalendarSettings.tsx を作成**

```typescript
import { useState } from 'react';
import { useProject } from '../../store/ProjectContext';
import type { Calendar } from '../../types';
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
```

- [ ] **Step 3: コミット**

```bash
git add src/components/CalendarSettings/
git commit -m "feat: add CalendarSettings dialog component"
```

---

### Task 12: StatusBar コンポーネント

**Files:**
- Create: `src/components/StatusBar/StatusBar.tsx`
- Create: `src/components/StatusBar/StatusBar.module.css`

- [ ] **Step 1: StatusBar.module.css を作成**

```css
.statusBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 12px;
  background: var(--accent-color);
  color: white;
  font-size: 12px;
  flex-shrink: 0;
}

.item {
  display: flex;
  align-items: center;
  gap: 16px;
}
```

- [ ] **Step 2: StatusBar.tsx を作成**

```typescript
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
```

- [ ] **Step 3: コミット**

```bash
git add src/components/StatusBar/
git commit -m "feat: add StatusBar component"
```

---

### Task 13: App コンポーネント（統合）

**Files:**
- Create: `src/App.tsx`
- Create: `src/App.module.css`
- Create: `src/index.css`

- [ ] **Step 1: index.css を作成（CSS変数定義・リセット）**

```css
:root {
  --bg-color: #1e1e1e;
  --toolbar-bg: #2c2c2c;
  --header-bg: #252525;
  --border-color: #3a3a3a;
  --text-color: #e0e0e0;
  --text-muted: #888;
  --accent-color: #007acc;
  --hover-bg: #353535;
  --active-bg: #404040;
  --selected-bg: #2a4a6d;
  --input-bg: #333;
  --milestone-color: #e8a838;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  height: 100%;
  overflow: hidden;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: App.module.css を作成**

```css
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
```

- [ ] **Step 3: App.tsx を作成**

```typescript
import { useState, useRef } from 'react';
import { Toolbar } from './components/Toolbar/Toolbar';
import { TaskTable } from './components/TaskTable/TaskTable';
import { GanttView } from './components/GanttView/GanttView';
import { CalendarSettings } from './components/CalendarSettings/CalendarSettings';
import { SplitPane } from './components/SplitPane/SplitPane';
import { StatusBar } from './components/StatusBar/StatusBar';
import styles from './App.module.css';

export function App() {
  const [showCalendar, setShowCalendar] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  return (
    <div className={styles.app}>
      <Toolbar
        onOpenCalendar={() => setShowCalendar(true)}
        svgRef={svgRef}
      />
      <SplitPane
        left={<TaskTable />}
        right={<GanttView svgRef={svgRef} />}
      />
      <StatusBar />
      {showCalendar && (
        <CalendarSettings onClose={() => setShowCalendar(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: コミット**

```bash
git add src/App.tsx src/App.module.css src/index.css
git commit -m "feat: add App root component integrating all parts"
```

---

### Task 14: エントリーポイント

**Files:**
- Create: `src/main.tsx`
- Create: `src/vite-env.d.ts`

- [ ] **Step 1: vite-env.d.ts を作成**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 2: main.tsx を作成**

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectProvider } from './store/ProjectContext';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </StrictMode>
);
```

- [ ] **Step 3: ビルド確認**

```bash
npm run build
```

Expected: エラーなくビルド成功

- [ ] **Step 4: devサーバーで動作確認**

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開き、以下を確認：
- ツールバーが表示される
- 左ペイン（タスク表）が表示される
- 右ペイン（ガントチャート）が表示される
- カレンダー設定ダイアログが開ける

- [ ] **Step 5: コミット**

```bash
git add src/main.tsx src/vite-env.d.ts
git commit -m "feat: add entry point and wire everything together"
```

---

### Task 15: ビルド確認と最終調整

- [ ] **Step 1: 全テスト実行**

```bash
npx vitest run
```

Expected: すべてのテスト PASS

- [ ] **Step 2: 型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: 本番ビルド**

```bash
npm run build
```

Expected: `dist/` が生成され、エラーなし

- [ ] **Step 4: プレビュー確認**

```bash
npm run preview
```

ブラウザで動作確認

- [ ] **Step 5: 最終コミット**

```bash
git add .
git commit -m "chore: final adjustments and verification"
```
