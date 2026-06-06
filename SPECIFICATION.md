# Gantt TODO Board — 仕様・実装・設定・セキュリティ ドキュメント

このドキュメントは、Gantt TODO Board VS Code 拡張機能を最初から完全に再現するために必要な情報をまとめたものである。

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [要件](#2-要件)
3. [ファイル構成](#3-ファイル構成)
4. [設定・ビルド環境](#4-設定ビルド環境)
5. [データモデル](#5-データモデル)
6. [永続化・ストレージ仕様](#6-永続化ストレージ仕様)
7. [拡張機能本体（extension.ts）の仕様](#7-拡張機能本体extensiontsの仕様)
8. [Webview HTML 仕様](#8-webview-html-仕様)
9. [フロントエンド（app.js）の仕様](#9-フロントエンドappjsの仕様)
10. [ガントチャート描画仕様](#10-ガントチャート描画仕様)
11. [スタイル（app.css）の仕様](#11-スタイルappcssの仕様)
12. [セキュリティ仕様](#12-セキュリティ仕様)
13. [ビルド・パッケージ手順](#13-ビルドパッケージ手順)
14. [既知の制約と注意事項](#14-既知の制約と注意事項)

---

## 1. プロジェクト概要

| 項目 | 値 |
|---|---|
| 拡張 ID | `local.gantt-todo-vscode` |
| 表示名 | Gantt TODO Board |
| バージョン | 0.0.1 |
| パブリッシャー | local |
| 最低 VS Code バージョン | 1.92.0 |
| 実装言語 | TypeScript（拡張本体）、JavaScript / CSS（Webview UI） |
| UIフレームワーク | Tailwind CSS（CDN 読み込み）、カスタム CSS |

**目的**: VS Code の Webview パネルとして起動するシンプルな TODO 管理 + ガントチャートツール。

---

## 2. 要件

### 機能要件

| # | 要件 |
|---|---|
| F-01 | タスクの追加・編集・削除ができること |
| F-02 | タスクにタイトル・カテゴリ・開始日・終了日・ステータス・優先度を設定できること |
| F-03 | ステータスは `todo` / `doing` / `done` の3値であること |
| F-04 | 優先度は `high` / `medium` / `low` の3値であること |
| F-05 | タスク一覧をカテゴリでフィルタリングできること |
| F-06 | ガントチャートを1日単位で表示できること |
| F-07 | ガントチャート軸は上段に月レイヤー、下段に日+曜日レイヤーの2段構成であること |
| F-08 | ガントチャートの土日セルを平日と色分けして表示すること（祝日は対象外） |
| F-09 | 今日の位置を赤い縦線で示すこと |
| F-10 | データをワークスペースの `.vscode/gantt-todo-data.json` へ自動保存すること |
| F-11 | ワークスペースが未開放の場合は `globalStorage` にフォールバックして保存すること |
| F-12 | 開始日 > 終了日の入力を検証してエラーメッセージを表示すること |
| F-13 | ショートカット `Ctrl+D Ctrl+D` でパネルを開けること |

### 非機能要件

| # | 要件 |
|---|---|
| N-01 | タブ増殖を防ぐため、パネルは最大1枚だけ開き、既存パネルを再利用すること |
| N-02 | Webview は `retainContextWhenHidden: true` で状態を保持すること |
| N-03 | UIは左3割（TODO管理）/ 右7割（ガント）の固定レイアウトとすること |
| N-04 | ミニマルなダークテーマ（Tailwind neutral 系）を使用すること |
| N-05 | ガントチャートは横スクロール・縦スクロール両対応であること |
| N-06 | 既存データ（priority 未設定）を読み込んだときも壊れず動作すること |

---

## 3. ファイル構成

```
gantt-todo-vscode/
├── src/
│   ├── extension.ts      # 拡張機能エントリポイント・Webview HTML 生成
│   ├── storage.ts        # JSON 永続化
│   └── types.ts          # 型定義
├── media/
│   ├── app.js            # Webview フロントエンドロジック
│   └── app.css           # ガントチャート専用スタイル
├── dist/                 # tsc ビルド出力（コミット対象外）
├── .vscode/
│   ├── launch.json       # デバッグ設定
│   ├── tasks.json        # ビルドタスク設定
│   └── extensions.json   # 推奨拡張
├── package.json
├── tsconfig.json
├── .vscodeignore
├── .gitignore
├── README.md
├── CHANGELOG.md
└── LICENSE
```

---

## 4. 設定・ビルド環境

### package.json（主要部分）

```json
{
  "name": "gantt-todo-vscode",
  "displayName": "Gantt TODO Board",
  "version": "0.0.1",
  "publisher": "local",
  "engines": { "vscode": "^1.92.0" },
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "ganttTodo.open", "title": "Gantt TODO: Open Board" }
    ],
    "keybindings": [
      {
        "command": "ganttTodo.open",
        "key": "ctrl+d ctrl+d",
        "when": "editorTextFocus || explorerViewletVisible || workbenchPanelVisible"
      }
    ]
  },
  "scripts": {
    "compile": "tsc -p .",
    "watch": "tsc -watch -p .",
    "package": "vsce package",
    "publish": "vsce publish"
  },
  "devDependencies": {
    "@types/node": "^20.14.12",
    "@types/vscode": "^1.92.0",
    "typescript": "^5.5.4",
    "@vscode/vsce": "^2.31.1"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "dist",
    "lib": ["ES2020", "DOM"],
    "types": ["node", "vscode"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "exclude": ["node_modules", ".vscode-test"]
}
```

---

## 5. データモデル

### src/types.ts

```typescript
export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "high" | "medium" | "low";

export interface TaskItem {
  id: string;          // Date.now() の文字列
  title: string;
  category: string;    // 未入力時は "General"
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  status: TaskStatus;
  priority: TaskPriority;
}

export interface TaskData {
  tasks: TaskItem[];
}
```

### 保存 JSON 例

```json
{
  "tasks": [
    {
      "id": "1717660000000",
      "title": "サンプルタスク",
      "category": "Backend",
      "startDate": "2026-06-01",
      "endDate": "2026-06-10",
      "status": "doing",
      "priority": "high"
    }
  ]
}
```

---

## 6. 永続化・ストレージ仕様

### src/storage.ts の動作

| 条件 | 読み込み先 | 保存先 |
|---|---|---|
| ワークスペースが開いている | `.vscode/gantt-todo-data.json` | 同左 |
| ワークスペースが開いているが ws ファイルが未存在で global に旧データあり | globalStorage から読み込み、ws にマイグレーション | `.vscode/gantt-todo-data.json` |
| ワークスペースが開いていない | `globalStorageUri/gantt-todo-data.json` | 同左 |

- `vscode.workspace.fs` API を使用し、`path` モジュールには依存しない。
- 保存時は親ディレクトリを `createDirectory` で自動作成する。
- ファイル未存在は `FileSystemError.code === "FileNotFound"` で判定し、空データを返す。

---

## 7. 拡張機能本体（extension.ts）の仕様

### activate 関数

1. `ganttTodo.open` コマンドを登録する。
2. コマンド実行時、既存の `boardPanel` があれば `reveal` して再利用する。
3. 新規作成時は `createWebviewPanel` でパネルを作成し、`onDidDispose` で参照をクリアする。
4. Webview からの `save` メッセージを受信し、`saveTaskData` → `postInitMessage` → `{ type: "saved" }` の順で処理する。
5. パネル作成後・再利用時の両方で `postInitMessage` を呼び、`init` メッセージを Webview へ送る。

### postInitMessage

```typescript
panel.webview.postMessage({
  type: "init",
  payload: {
    data: TaskData,
    storagePath: string  // 表示用パス文字列
  }
});
```

### nonce 生成

- 英数字 16 文字のランダム文字列。
- `<script nonce>` と CSP ヘッダーに同じ値を使用する。

### CSP ヘッダー設定

```
default-src 'none';
style-src {cspSource} 'unsafe-inline';
script-src 'nonce-{nonce}' https://cdn.tailwindcss.com;
```

---

## 8. Webview HTML 仕様

### レイアウト

```
<main class="grid h-full w-full grid-cols-1 lg:grid-cols-10">
  <section class="lg:col-span-3">  <!-- 左3割：TODO管理 -->
    <header>タイトル・ストレージパス</header>
    <section>入力フォーム</section>
    <section>カテゴリフィルタ</section>
    <section>TODO一覧テーブル</section>
  </section>
  <section class="lg:col-span-7">  <!-- 右7割：ガントチャート -->
    <div id="gantt">...</div>
  </section>
</main>
```

### 入力フォームの要素

| id | 種別 | 用途 |
|---|---|---|
| `category` | `<input type="text">` | カテゴリ（任意、省略時 "General"） |
| `title` | `<input type="text">` | タスクタイトル（必須） |
| `startDate` | `<input type="date">` | 開始日 |
| `endDate` | `<input type="date">` | 終了日 |
| `status` | `<select>` | todo / doing / done |
| `priority` | `<select>` | high / medium（default） / low |
| `addTask` | `<button>` | 追加または更新 |
| `formError` | `<p>` | バリデーションエラー表示（通常 hidden） |

### TODO一覧テーブルの列

Title / Category / Start / End / Status / Priority / Actions（Delete ボタン）

---

## 9. フロントエンド（app.js）の仕様

### 状態（state）

```javascript
const state = {
  tasks: [],          // TaskItem[]
  editingId: null,    // 編集中タスクの id（null = 新規追加モード）
  categoryFilter: "", // "" = 全カテゴリ
  storagePath: ""     // 表示用パス文字列
};
```

### メッセージ通信

| 方向 | type | payload |
|---|---|---|
| 拡張 → Webview | `init` | `{ data: TaskData, storagePath: string }` |
| Webview → 拡張 | `save` | `{ tasks: TaskItem[] }` |

### 主要関数

| 関数 | 処理 |
|---|---|
| `render()` | storagePath 表示・カテゴリフィルタ・テーブル・ガントを再描画 |
| `renderCategoryFilter()` | タスクから一意カテゴリ一覧を生成し select に反映 |
| `renderTable()` | タスク行を生成。クリックで編集モード切替 |
| `renderGantt()` | ガントチャート全体を生成 |
| `renderGanttAxis()` | 2段軸（月レイヤー + 日/曜日レイヤー）を生成 |
| `appendMonthSegments()` | 月ごとのセグメントブロックを生成 |
| `appendAxisTick()` | 1日分の目盛りと日番号・曜日ラベルを生成 |
| `appendDayBackground()` | 平日/土日の背景セルを生成 |
| `appendGlobalTodayLine()` | 今日の赤縦線を描画 |
| `validateDateRange()` | 開始日・終了日の妥当性を検証し `{ ok, message }` を返す |
| `normalizeTask()` | priority 未設定の既存データを `"medium"` に補完 |
| `getValidPriority()` | high/medium/low 以外の値を `"medium"` に正規化 |
| `escapeHtml()` | `& < > " '` の5文字を HTML エンティティに変換 |
| `isWeekend()` | `getDay()` が 0（日）または 6（土）なら `true` |
| `getWeekdayLabel()` | 日〜土のラベル配列から曜日文字を返す |
| `getDayNumberLabel()` | 日付の「日」部分を2桁ゼロ埋め文字列で返す |
| `getMonthLabel()` | `YYYY/MM` 形式の月ラベルを返す |
| `startOfDay()` | 時刻部分を 0:00:00 にリセットしたタイムスタンプを返す |

### 行クリックで編集モードに入る挙動

1. 行をクリックすると、そのタスクの値をフォームに復元して `state.editingId` を設定する。
2. 同じ行を再クリックすると `clearForm()` を呼んで新規追加モードに戻る。
3. Delete ボタンのクリックは `stopPropagation` で行クリックと分離している。

---

## 10. ガントチャート描画仕様

### 表示範囲の計算

```
min = startOfDay(全タスク開始日・終了日・today の最小値)
max = startOfDay(全タスク開始日・終了日・today の最大値)
totalDays = round((max - min) / dayMs) + 1
trackWidth = max(720, totalDays * 34)  // px
labelWidth = 170  // px（固定）
dayWidth = trackWidth / totalDays
```

### 軸の2段構造

```
gantt-axis
└── gantt-axis-label ("Date")
└── gantt-axis-layers
    ├── gantt-axis-month-track   ← 上段：月セグメント
    │   └── gantt-axis-month-segment × 月数
    │       └── gantt-axis-month-label  "YYYY/MM"
    └── gantt-axis-day-track     ← 下段：日+曜日
        ├── gantt-day-cell.weekday or .weekend × totalDays
        ├── gantt-axis-tick × totalDays
        └── gantt-axis-day-label.weekday or .weekend × totalDays
            ├── gantt-axis-day-number  "DD"
            └── gantt-axis-weekday    "月"〜"日"
```

### タスクバーの左位置・幅の計算

```
startOffsetDays = round((startOfDay(task.startDate) - min) / dayMs)
durationDays    = max(1, round((endOfDay - startOfDay) / dayMs) + 1)
left  = (startOffsetDays / totalDays) * 100  [%]
width = (durationDays    / totalDays) * 100  [%]
```

### 今日ライン

```
todayOffsetDays = round((today - min) / dayMs)
todayPercent    = (todayOffsetDays + 0.5) / totalDays * 100  [%]
left (px)       = labelWidth + trackWidth * todayPercent / 100
```

---

## 11. スタイル（app.css）の仕様

### 主要クラスと役割

| クラス | 役割 |
|---|---|
| `.gantt-content` | ガント全体の縦並びコンテナ（`flex-direction: column`） |
| `.gantt-axis` | 軸行（grid 2列：ラベル + 軸レイヤー） |
| `.gantt-axis-layers` | 2段軸の縦並びコンテナ |
| `.gantt-axis-month-track` | 上段月レイヤー（height: 18px） |
| `.gantt-axis-month-segment` | 月セグメント（絶対配置、左ボーダーで区切り） |
| `.gantt-axis-month-label` | 月ラベル文字（left: 4px） |
| `.gantt-axis-day-track` | 下段日レイヤー（height: 30px） |
| `.gantt-day-cell.weekday` | 平日背景（ほぼ透明） |
| `.gantt-day-cell.weekend` | 土日背景（薄い赤） |
| `.gantt-axis-tick` | 1日分の目盛り縦線 |
| `.gantt-axis-day-label` | 日番号+曜日の2行ラベルコンテナ |
| `.gantt-axis-day-label.weekend` | 土日ラベル色（薄いピンク） |
| `.gantt-row` | タスク行（grid 2列：ラベル + トラック） |
| `.gantt-track` | タスクバーのトラック（1日グリッド付き） |
| `.gantt-bar` | タスクバー本体 |
| `.gantt-today-line` | 今日の赤縦線（`z-index: 10`） |

### ステータス別バーの色

| status | 色 |
|---|---|
| `todo` | `#52525b`（zinc） |
| `doing` | `#a16207`（amber） |
| `done` | `#166534`（green） |

### 優先度バッジの色（Tailwind クラス）

| priority | 色 |
|---|---|
| `high` | rose系 |
| `medium` | violet系 |
| `low` | cyan系 |

---

## 12. セキュリティ仕様

### Content Security Policy

Webview の CSP は以下を設定する。

```
default-src 'none';
style-src {cspSource} 'unsafe-inline';
script-src 'nonce-{nonce}' https://cdn.tailwindcss.com;
```

- インラインスクリプトは nonce がない限り実行不可。
- `default-src 'none'` で外部通信を全面遮断。
- Tailwind CDN のみ例外許可。

### XSS 対策

| 経路 | 対策 |
|---|---|
| テーブル title / category | `escapeHtml()` でサニタイズしてから `innerHTML` に埋め込む |
| カテゴリフィルタ候補 | `option.textContent` を使用（HTMLとして解釈されない） |
| ガントラベル（title / dates） | `textContent` を使用 |
| ガントバーの tooltip | `bar.title = ...`（属性値のため任意文字列可） |

### 既知のXSS残存リスク

`renderTable` の `tr.innerHTML` テンプレート内で `task.startDate`、`task.endDate`、`task.status`、`task.priority` を直接埋め込んでいる。これらはUIのセレクトや date input から取得するため通常は安全だが、JSON ファイルを直接書き換えた場合に HTML が注入される可能性がある。完全に排除するには `innerHTML` を排除して `textContent` / `createElement` ベースに置き換える必要がある。

### Webview ↔ 拡張間通信

- `isMessage` / `isTaskData` で受信メッセージの型を事前検証する。
- `type === "save"` かつ `payload.tasks` が配列のものだけ処理する。

---

## 13. ビルド・パッケージ手順

```bash
# 依存パッケージインストール
npm install

# TypeScript コンパイル
npm run compile

# VSIX パッケージ作成
npm run package
# → gantt-todo-vscode-0.0.1.vsix が生成される

# VS Code に強制再インストール
code --install-extension gantt-todo-vscode-0.0.1.vsix --force

# ウィンドウ再読み込み（反映）
code -r .
```

### VSIX に含まれるファイル

```
dist/extension.js
dist/storage.js
dist/types.js
media/app.js
media/app.css
media/activity-icon.svg
package.json
tsconfig.json
README.md
CHANGELOG.md
LICENSE
```

---

## 14. 既知の制約と注意事項

| 制約 | 内容 |
|---|---|
| サイドバー未使用 | ActivityBar / サイドバー方式は採用しない。コマンドまたはショートカットで起動する |
| 祝日非対応 | 土日のみ色分け。祝日は考慮しない |
| priority の後付け互換 | 旧データ（priority 未設定）は `normalizeTask` で `"medium"` に補完して読み込む |
| DEP0169 警告 | `code --install-extension` 実行時に Node.js の URL 非推奨警告が出るが、インストール自体は成功する |
| ms-python.vscode-python-envs の subscriptions エラー | デバッグ時に外部拡張由来のエラーが出る場合がある。Clean Host でその拡張を無効化して切り分けること |
