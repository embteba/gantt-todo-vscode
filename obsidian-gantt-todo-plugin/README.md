# Gantt TODO Board (Obsidian Plugin)

VS Code版 **Gantt TODO Board** の仕様を、Obsidian向けにローカル完結で移植したプラグインです。

## 特徴

- TODO管理（`todo` / `doing` / `done`）
- タスク属性: タイトル / カテゴリ / 開始日 / 終了日 / 優先度
- カテゴリフィルタ
- 2段軸（月 + 日/曜日）のガントチャート
- 土日背景の色分け
- 今日を示す赤い縦線
- 行クリックで編集、Deleteで削除
- `priority` 未設定データの互換読み込み（`medium`補完）

## ローカル動作ポリシー

- 外部APIやクラウド保存は使いません。
- データは Obsidian ローカル環境にのみ保存されます。
- 保存先: `.obsidian/plugins/gantt-todo-board/data.json`

## 設計

1. `main.ts`  
   プラグインエントリ。ビュー登録、単一ビュー再利用、保存データロードを担当。
2. `src/boardView.ts`  
   UIレンダリング、フォーム入力、テーブル、ガント描画、永続化呼び出しを担当。
3. `src/logic.ts`  
   日付検証、データ正規化、ガント計算などの純粋関数を担当（テスト対象）。
4. `styles.css`  
   2ペイン（3:7）レイアウトとガント表示スタイルを定義。

## 開発

```bash
npm install
npm run check
npm run test
npm run build
```

## ビルド不要で使う（配布済みファイル）

このリポジトリの `release/gantt-todo-board/` には、プラグイン実行に必要なファイルをまとめて配置しています。

- `manifest.json`
- `main.js` (ビルド済み)
- `styles.css`

Node.js や npm でビルド環境を作らなくても、そのまま利用できます。

## Obsidianへの導入（手動）

1. `release/gantt-todo-board/` 内の3ファイルを、Vault の `.obsidian/plugins/gantt-todo-board/` にコピー
3. Obsidian の Community Plugins で `Gantt TODO Board` を有効化
4. コマンドパレットから `Open Gantt TODO Board` を実行

## 開発者向け: 配布フォルダ更新

```bash
npm install
npm run build:release
```
