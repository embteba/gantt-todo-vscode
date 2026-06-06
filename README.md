# Gantt TODO Board

ガントチャート×TODOツール - VS Codeで効率的にタスク管理できる拡張機能です。

## 機能

- **シンプルなTODOボード**: todo、doing、doneの3つのステータスでタスクを管理
- **ガントチャート表示**: タスクの日程を視覚的に確認
- **カテゴリ分け**: プロジェクトやチームごとにタスクを整理
- **データ永続化**: ワークスペース内に自動保存


## 使い方

### ボードを開く

1. VS Codeのコマンドパレットから `Gantt TODO: Open Board` を選択
2. ショートカット `Ctrl+D` → `Ctrl+D` でもボードを開けます



### タスクを追加

1. ボード上部の入力フィールドにタスク情報を入力
   - **タイトル**: タスクの名前
   - **カテゴリ**: プロジェクト名やチーム名
   - **開始日**: `YYYY-MM-DD` 形式
   - **終了日**: `YYYY-MM-DD` 形式
2. 「Add Task」ボタンをクリック

### ステータスを変更

ボード上のカラムにタスクをドラッグして、ステータスを変更できます。

## データ保存

タスクデータは以下の場所に自動保存されます：
- **ワークスペース使用時**: `.vscode/gantt-todo-data.json`
- **グローバル保存**: グローバルストレージディレクトリ

## インストール

### VS Code Extension Marketplace からのインストール

VS Code の Extension Marketplace から「Gantt TODO Board」を検索してインストールしてください。

### リポジトリからのインストール（開発者向け）

1. **リポジトリのクローン**

```bash
git clone https://github.com/embteba/gantt-todo-vscode.git
cd gantt-todo-vscode
```

2. **依存パッケージのインストール**

```bash
npm install
```

3. **拡張機能のビルド**

```bash
npm run compile
```

4. **VS Code での実行**

VS Code でこのフォルダを開き、`F5` キーを押すか「実行 > デバッグの開始」を選択して拡張機能を実行します。

## 開発

### セットアップ

```bash
npm install
```

### ビルド

```bash
npm run compile
```

### ウォッチモード（常駐コマンド）

開発中にコードを編集して自動的にコンパイルする場合は、ウォッチモードを使用します：

```bash
npm run watch
```

このコマンドは常駐し、ソースコードの変更を監視して自動的にビルドします。別のターミナルで以下を実行してデバッグを開始します：

```bash
# 別のターミナルウィンドウで実行
# VS Code でこのフォルダを開き、F5 を押すか「実行 > デバッグの開始」を選択
```

### パッケージング（VSIX ファイルの作成）

拡張機能を VSIX ファイルにパッケージングするには：

```bash
npm run package
```

このコマンドは `gantt-todo-vscode-{version}.vsix` ファイルを生成します。

**VSIX ファイルのインストール：**

1. VS Code を開く
2. 拡張機能ビューを開く（`Ctrl+Shift+X`）
3. 右上の「...」メニューから「VSIX からインストール」を選択
4. 生成された VSIX ファイルを選択してインストール

**または、コマンドラインでインストール：**

```bash
code --install-extension gantt-todo-vscode-{version}.vsix
```

## サポート

問題や機能リクエストがある場合は、GitHubリポジトリにissueを作成してください。
