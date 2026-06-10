# ガントチャートツール 設計書

## 目的

個人のプロジェクト管理のためのブラウザベースのガントチャートツール。
MS Project を参考にした操作性で、タスクの階層管理・カレンダー設定・マイルストーン表示を提供する。

## 配布形態

- Cloudflare Pages にホスティングする静的SPA（バックエンド不要）
- データはブラウザローカル（IndexedDB）に保存、JSONファイルでのエクスポート／インポートが可能
- SVGファイルとしてガントチャートをエクスポートし、PowerPoint / Excel に貼り付け可能

## 技術スタック

| 層 | 技術 | 理由 |
|---|---|---|
| フレームワーク | React 18 | ユーザー指定 |
| 言語 | TypeScript | 型安全 |
| ビルドツール | Vite | Cloudflare Pagesとの親和性 |
| ガントチャート描画 | frappe-gantt（MIT）ベース + 独自拡張 | SVG描画・軽量・拡張容易 |
| データ永続化 | idb（IndexedDBラッパー） | ブラウザ内でデータ永続化 |
| SVGエクスポート | XMLSerializer + Blobダウンロード | ライブラリ不要、DOMシリアライズ |
| スタイリング | CSS Modules | コンポーネントスコープ・シンプル |

## 機能要件

### 必須機能
1. **タスクの階層構造** — サマリータスクとサブタスクの親子関係、インデントによる表示
2. **カレンダー設定** — 稼働日（曜日指定）・非稼働日・カスタム休日の設定
3. **マイルストーン** — 期間ゼロの節目タスクを◆マークで表示
4. **SVGエクスポート** — ガントチャート部分をSVGファイルとして保存
5. **JSONファイル保存／読込** — プロジェクトデータをファイルでやり取り

### スコープ外（将来検討）
- タスク間の依存関係（FS/SS/FF/SF）
- クリティカルパス計算
- リソース管理
- ベースライン比較
- 認証／マルチユーザー

## アーキテクチャ

```
ブラウザ (React SPA)
├── IndexedDB  ←→  JSONファイル保存/読込
├── React State（タスク・カレンダー）
├── frappe-gantt（SVGガントチャート描画）
└── XMLSerializer（SVGエクスポート）

デプロイ先: Cloudflare Pages (git push → 自動ビルド＆デプロイ)
```

## コンポーネント構成

```
App
├── Toolbar
│   ├── NewProject / OpenProject / SaveProject
│   ├── AddTask / DeleteTask / Indent / Outdent
│   ├── CalendarSettings（ダイアログ）
│   └── ExportSVG
├── SplitPane
│   ├── TaskTable（左ペイン）
│   │   ├── TaskHeader（列ヘッダー：番号, タスク名, 期間, 開始日, 終了日）
│   │   └── TaskRow[]（編集可能な1行、インデントで階層を表現）
│   └── GanttView（右ペイン）
│       ├── TimelineHeader（日付スケールヘッダー）
│       ├── TaskBar[]（バー描画、ドラッグで期間変更）
│       └── Milestone[]（◆マイルストーンマーカー）
└── StatusBar
    └── プロジェクト名 / 稼働日設定サマリー
```

## データモデル

```typescript
interface Project {
  name: string;
  calendar: Calendar;
  tasks: Task[];
}

interface Calendar {
  workingDays: number[];  // 0=日曜, 1=月曜... デフォルト [1,2,3,4,5]
  holidays: string[];     // YYYY-MM-DD 形式のカスタム休日
}

interface Task {
  id: string;             // UUID
  name: string;
  startDate: string;      // YYYY-MM-DD
  endDate: string;        // YYYY-MM-DD （startDate + duration から稼働日計算）
  duration: number;       // 稼働日数
  parentId: string | null; // 階層構造
  isMilestone: boolean;   // trueの場合 duration=0, endDate=startDate
  progress: number;       // 0-100
}
```

## 稼働日計算

- `startDate + duration` から `endDate` を計算する際、`Calendar.workingDays` に含まれない曜日と `Calendar.holidays` をスキップ
- 日付計算は `date-fns` などの軽量ライブラリを使用

## SVGエクスポートフロー

1. ユーザーが「SVGエクスポート」ボタンをクリック
2. ガントチャート領域の `<svg>` DOM要素を取得
3. `XMLSerializer` で文字列にシリアライズ
4. SVG Blob を生成し `<a download>` でファイル保存ダイアログを表示
5. 保存された `.svg` ファイルを PowerPoint / Excel に貼り付け

## 画面レイアウト

```
┌─ ツールバー ─────────────────────────────────────────────┐
│ [新規] [開く] [保存] │ [+タスク] [削除] [→] [←] │ [🗓 カレンダー] [SVG出力] │
├─ 左ペイン（タスク表）──────┬─ 右ペイン（ガントチャート）──────┤
│ # │ タスク名      │期間│開始│終了│  6/1   6/5   6/10  6/15  │
│ 1 │▼ 設計フェーズ │10日│6/1 │6/12│  ████████████████ (summary) │
│ 2 │  ├ 要件定義   │ 3日│6/1 │6/3 │    ████                     │
│ 3 │  └ 詳細設計   │ 4日│6/4 │6/8 │        ██████               │
│ 4 │◆ リリース    │ 0日│7/3 │7/3 │                  ◆          │
├───────────────────────────┴────────────────────────────────┤
│ プロジェクト: sample.gannt  │ 稼働日: 月-金                │
└────────────────────────────────────────────────────────────┘
```

- 左ペインと右ペインはリサイズ可能なスプリットビュー
- ガントチャートは横スクロール・縦スクロール対応
- タスクバーはドラッグで日付変更可能
- タスク名・日付はインライン編集可能

## プロジェクトファイル構成

```
gannt/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .gitignore
├── src/
│   ├── main.tsx                 # エントリーポイント
│   ├── App.tsx                  # ルートコンポーネント
│   ├── types/
│   │   └── index.ts             # Project, Task, Calendar 型定義
│   ├── store/
│   │   └── projectStore.ts      # IndexedDB永続化 + React状態管理
│   ├── utils/
│   │   ├── calendar.ts          # 稼働日計算ロジック
│   │   ├── export.ts            # SVGエクスポート / JSONファイル保存
│   │   └── taskTree.ts          # 階層構造操作（indent/outdent/parent集計）
│   ├── components/
│   │   ├── Toolbar/
│   │   │   ├── Toolbar.tsx
│   │   │   └── Toolbar.module.css
│   │   ├── TaskTable/
│   │   │   ├── TaskTable.tsx
│   │   │   ├── TaskRow.tsx
│   │   │   └── TaskTable.module.css
│   │   ├── GanttView/
│   │   │   ├── GanttView.tsx
│   │   │   └── GanttView.module.css
│   │   ├── CalendarSettings/
│   │   │   ├── CalendarSettings.tsx
│   │   │   └── CalendarSettings.module.css
│   │   ├── SplitPane/
│   │   │   ├── SplitPane.tsx
│   │   │   └── SplitPane.module.css
│   │   └── StatusBar/
│   │       ├── StatusBar.tsx
│   │       └── StatusBar.module.css
│   └── assets/
│       └── (アイコン等)
├── public/
│   └── favicon.svg
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-06-10-gantt-chart-tool-design.md
```

## 依存ライブラリ

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "frappe-gantt": "^0",
    "idb": "^8",
    "date-fns": "^4"
  },
  "devDependencies": {
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5",
    "vite": "^6",
    "@vitejs/plugin-react": "^4"
  }
}
```

## Cloudflare Pages設定

- ビルドコマンド: `npm run build`
- 出力ディレクトリ: `dist`
- フレームワークプリセット: Vite（自動検出）
- カスタムドメイン: 必要な場合のみ設定
