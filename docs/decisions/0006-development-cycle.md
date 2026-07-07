# 開発サイクルとCI/CD方針を定める

## 状況

道の駅v2ではコード実装をAI（Claude Code + Codex）に委譲する方針。人間はプロジェクト管理・意思決定・レビューに専念する。この体制で品質を保つには、開発サイクルを明文化して、実装〜レビュー〜QA〜デプロイの各段階で機械的に検証が回るようにする必要がある。

旧repoは以下のサイクルで運用されていた:

```
実装 → コードレビュー(agent) → QA(Playwright) → PR作成
```

v2ではこれを踏襲しつつ、Cloudflareインフラ特有の要素（Preview Deployments、Wrangler CLI）を組み込む。

## 決定

### ブランチ戦略

**GitHub Flow を採用する。**（旧repo踏襲）

- `main` は常にデプロイ可能な状態を保つ
- `main` への直接コミットは禁止
- 作業は必ずブランチを切って行い、PRを経由して `main` にマージ
- ブランチ命名: `feature/<issue番号>-<説明>` / `fix/<issue番号>-<説明>`
- PR本文には `Closes #<issue番号>` を含める

### issue運用

**作業開始前に必ずissueを起票する。**（旧repo踏襲）

- 新機能・バグ修正・リファクタリング問わず
- issue本文に概要・原因・修正方針を記載
- ブランチはissueを作成してから切る
- issue番号のないブランチは作成しない

### コミット前検証

**Husky + lint-staged を導入する。**

コミット時に以下を自動実行:

- `tsc --noEmit`: 型チェック
- `eslint --fix`: Lint（自動修正可能な部分は修正）
- `prettier --write`: フォーマット
- 対象ファイルのテスト実行（可能な範囲で）

**プッシュ前検証** として、pre-pushフックまたは手動で:

- 全体テスト実行（`pnpm test`）
- ビルド確認（`pnpm build`）

### コードレビュー

**三段構え** で行う:

1. **Codex実装** — Codexが実装完了時に自己サマリを返す
2. **Claudeレビュー** — Claudeが `git diff` を確認し、明らかな問題を検出
3. **必要に応じて code-review-expert agent** — 複雑な変更や重要な機能では追加の第三者レビューをagent経由で実施

指摘があれば修正 → 再レビュー、を指摘がなくなるまで繰り返す。

### QA

**Playwright を採用する。**（旧repo踏襲、ただし実行環境を変更）

- テストコード: `apps/web/e2e/` に配置
- ローカル実行: **Wrangler dev + Vite dev** に対して実行（Docker廃止）
- CI実行: GitHub Actions で `main` へのPR時に自動実行
- QAシナリオ管理: `docs/qa-scenarios.md` で一覧管理（旧repo踏襲）
- 認証: Google OAuthのため `storageState` 方式で対応（旧repo踏襲）

QAで問題があれば修正 → コードレビューからやり直し。

### PR作成フロー

**旧repo踏襲**:

1. 実装完了
2. コードレビュー（指摘なくなるまで反復）
3. QA（問題なくなるまで反復）
4. PR作成、QA結果をPRコメントに投稿

PRコメントのフォーマットは旧repoに準じる。

### プレビュー環境

**Cloudflare Preview Deployments を利用する。**

- PRごとに自動でPreview URLが発行される
- Cloudflare Pages（web）とWorkers（api）はGitHub連携で自動デプロイ
- Preview環境のQAはPreview URLに対して実行する
- Preview環境のD1・R2は本番と分離（`preview_database_id`, preview R2 bucket）

### マージ後デプロイ

**Cloudflare GitHub連携による自動デプロイ。**

- `main` マージで本番環境に自動デプロイ
- 追加のCD設定（ArgoCD等）は導入しない
- ロールバックは Cloudflareダッシュボード or `wrangler rollback`

### 全体フロー図

```
issue起票
   ↓
ブランチ作成（feature/#N-説明）
   ↓
実装（Codex）
   ↓
コミット（Husky: 型チェック・Lint・Format）
   ↓
Claudeレビュー（git diff確認）
  ↓ 指摘あり → 修正 → 再レビュー
   ↓ 指摘なし
必要に応じ code-review-expert agent
   ↓
Push（pre-push: build + test）
   ↓
PR作成
   ↓
Cloudflare Preview Deploy（自動）
   ↓
QA（Playwright on Preview URL）
  ↓ 問題あり → 修正 → レビューから再実行
   ↓ 問題なし
PR コメントにQA結果投稿
   ↓
マージ
   ↓
Cloudflare本番デプロイ（自動）
```

## 理由

### GitHub Flow

- 個人開発〜小規模チームに最適なシンプルさ
- 旧repoで実運用実績あり、知見をそのまま引き継げる
- Cloudflare Pages/WorkersのGitHub連携が `main` トリガーで自然に噛む

### Husky + lint-staged

- コミット時点で最低限の品質を担保できる
- CIで初めて失敗に気付くコストを減らす
- 旧repoは「コミット前にコンテナ内でbuild/test」を手動運用していたが、v2は自動化する

### コードレビュー三段構え

- CodexとClaudeの分担が定まったので、Codex実装 → Claudeレビューが基本ライン
- ただしClaudeは実装文脈に近いためバイアスがかかりうる
- 重要変更では code-review-expert agent の独立レビューを挟むことで品質を確保

### Playwright継続

- 旧repoで実運用実績・シナリオ資産が存在
- E2Eツールのデファクトで、AIによるテスト生成も容易
- 旧repoのDocker実行はWrangler devに置き換えることで開発体験を改善

### Cloudflare自動デプロイ

- Cloudflareの標準機能で完結、追加インフラ不要
- Preview Deploymentsが標準提供されるためPRごとの動作確認が容易
- ArgoCD等のOSS CDツールは個人開発規模では過剰

### 却下した選択肢

- **CircleCI / Jenkins等の外部CI**: GitHub ActionsとCloudflare組み込みで十分
- **手動デプロイ運用**: 手作業が増えるだけで得るものがない
- **QAをVitest等のユニット中心にする**: E2Eの信頼性を失うトレードオフに見合わない
- **Docker Compose継続**: Wrangler devで完結する構成のため不要（ADR-0007相当の別文脈だが本ADRでも参照）

## 結果

（後から追記）
