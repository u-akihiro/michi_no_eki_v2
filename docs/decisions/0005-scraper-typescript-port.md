# マスターデータ収集をTypeScriptに移植し、段階的に実行モデルを変える

## 状況

道の駅マスターデータの取得源は、旧repoADR-0007の判断を引き継ぎ、道の駅公式ディレクトリサイト **michi-no-eki.jp** からのスクレイピングとする。国交省CSVは更新頻度が不明で情報が古い実績があるため採用しない。

旧repoの実装は Go で `backend/cmd/scrape_master/` に存在するが、v2は言語をTypeScript統一する方針（ADR-0002）のため、これをTypeScriptに移植する必要がある。

さらに、実行環境を旧repo（AWS上のGoバイナリ）からCloudflare前提に切り替える必要がある。Workers上でのスクレイピング実行はCPU時間制限の懸念があるため、実行モデルを再設計する。

## 決定

### 移植方針

- 旧repoの `backend/cmd/scrape_master/` のロジックを **TypeScriptに移植**する
- 実装は `apps/scraper/` にモノレポ上のアプリとして配置する
- 実装ライブラリ:
  - HTTPクライアント: **標準 `fetch`**
  - HTMLパース: **`cheerio`**
  - バリデーション: **zod**（型定義は `packages/shared` と共有）
- レート制御: **1リクエスト/秒**（旧repoに明示的な制御がなくても新規に導入する）
- 出力形式: **JSON**（1ファイルに全駅を配列で出力、後段のD1 seedスクリプトで変換）

### 移植は「機会があれば改良」

旧repoロジックをベースにするが、以下の改善が可能なら合わせて取り込む:
- レート制御の追加（旧repoにあれば踏襲）
- リトライ・エラーハンドリング
- 不要になったスクレイピング項目（例: 個別公式サイトへの二段階アクセス）の削除

### 実行モデルの段階的移行

**MVP段階（ワンショット実行）:**
1. ローカルで `pnpm --filter scraper scrape` を実行
2. `apps/scraper/output/stations.json` に結果を出力
3. `pnpm --filter api db:seed` でD1に投入

**運用開始後（GitHub Actions定期実行に移行）:**
1. GitHub Actionsのcron trigger（月次程度）で `apps/scraper` を実行
2. 結果を wrangler CLI 経由でD1に書き込み
3. 差分検出とアラートを組み込む

## 理由

### TypeScript移植を選ぶ理由

- 言語をTypeScriptに統一する方針（プロジェクト全体の技術スタック統一）
- `packages/shared` の型定義（Zod schema）を再利用可能
- モノレポ内のスクリプト実行がpnpm workspacesで完結

### Workers Cron Trigger / Workflows を採用しない理由

- **Workers Cron Trigger**: CPU時間制限（有料枠30秒）でスクレイピングの全駅処理が完走しない可能性
- **Cloudflare Workflows**: 長時間タスク対応だが新機能で学習コストが高く、MVP段階には過剰
- **GitHub Actions**: 実行時間制限が緩く、既存のCI/CD知見で運用可能

### ワンショット→GitHub Actionsの段階移行

- MVP段階は「まず動くデータを得る」が優先で、自動化の投資は不要
- 運用開始後、更新頻度（月次程度）が固まってからActions化する方が要件が明確
- 道の駅の新設・廃止は頻繁でないため、月次更新で十分

### 旧repoの本番DBからのデータ流用を採用しない理由

ユーザー方針により、旧repoのDBダンプ流用は行わず、v2は新規にスクレイピングしてデータを収集する。

### 出力形式にJSONを選ぶ理由

- TypeScript内で扱いやすい（構造化データそのまま）
- D1 seedスクリプトで INSERT SQL に変換可能
- CSVより型情報を保持しやすい

## 結果

（後から追記）
