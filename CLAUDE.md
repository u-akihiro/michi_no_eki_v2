# プロジェクト概要

道の駅の管理サービス。旧サービス（https://github.com/u-akihiro/michi_no_eki 、Go + React + AWS/Neon構成）のインフラをAWSからCloudflareに載せ替えるため、コードレベルで作り直すプロジェクト。

最終的には旧サービスと同等以上の機能を再現するが、初期はミニマムに開発を進める。

## MVPスコープ

第一段のスコープは以下の2機能に限定する。範囲外の機能（チェックイン、ルートプラン、画像アップロード、レビュー等）は現段階では実装しない。

1. **ユーザーログイン**（Google OAuth）
2. **全国の道の駅の一覧をマップで閲覧**（Leaflet + OSMタイル）

# 技術スタック

| 領域             | 選定                                                | 関連ADR  |
| ---------------- | --------------------------------------------------- | -------- |
| インフラ         | Cloudflare (Workers / D1 / R2)                      | -        |
| リポジトリ構成   | pnpm workspaces モノレポ                            | ADR-0001 |
| 言語             | TypeScript                                          | ADR-0002 |
| バックエンドFW   | Hono (on Workers)                                   | ADR-0002 |
| フロントエンドFW | React + Vite (on Pages)                             | -        |
| UI               | Tailwind CSS + shadcn/ui                            | ADR-0003 |
| ORM              | Drizzle ORM (D1)                                    | -        |
| 認証             | Google OAuth                                        | -        |
| 地図ライブラリ   | Leaflet + react-leaflet                             | -        |
| 地図タイル       | OpenStreetMap公式                                   | ADR-0004 |
| 開発環境         | Wrangler + Vite dev（ホスト直起動、Node 20 + pnpm） | -        |
| データ取得       | michi-no-eki.jp スクレイピング（TypeScript）        | ADR-0005 |

## コーディング規約

- **TypeScript の `verbatimModuleSyntax` が有効**: 型のみを import / export する箇所は `import type` / `export type` を明示すること。値と型を混在させた `import { Foo }` は型がランタイム参照として残り、Cloudflare Workers / Vite でビルドエラーになる。

# モノレポ構成

```
michi_no_eki_v2/
├── apps/
│   ├── api/         # Workers + Hono
│   ├── web/         # Pages + React + Vite
│   └── scraper/     # データ取得スクリプト
├── packages/
│   └── shared/      # 型定義・zodスキーマ・定数
├── docs/
│   └── decisions/   # ADR
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## モノレポ運用の規律

将来リポジトリ分割が必要になったときのコストを最小化するため、以下を守る。

1. **`apps/*` 同士の相互import禁止** — appは常に独立
2. **共有コードは `packages/shared` に配置** — 型・zodスキーマ・定数のみ
3. **各appが独立ビルド・テスト・デプロイで完結する** — スクリプトはapp配下で完結
4. **web ↔ api の通信は HTTP（Hono RPC or OpenAPI）に限定** — 直接コード参照しない

# 開発ワークフロー

詳細な意思決定は ADR-0006 を参照。ここでは実務ルールのみ記載する。

## ブランチ戦略（GitHub Flow）

- `main` は常にデプロイ可能な状態を保つ
- `main` への直接コミット禁止
- 作業は必ずブランチを切って行う
- ブランチ命名:
  - 新機能: `feature/<issue番号>-<説明>`
  - バグ修正: `fix/<issue番号>-<説明>`
- PR本文には `Closes #<issue番号>` を含める

## issue先行の原則

作業を始める前に必ずissueを起票する。issue番号のないブランチは作成しない。

- 新機能・バグ修正・リファクタリング問わず
- issue本文に「概要・原因・修正方針」を記載

## コミット前検証（自動）

Huskyが自動実行する（開発者は意識不要、フックが失敗したら修正）:

- 型チェック: `tsc --noEmit`
- Lint: `eslint --fix`
- フォーマット: `prettier --write`
- 変更対象のテスト実行

## プッシュ前検証

Pushする前に必ず実行:

```powershell
pnpm test    # 全体テスト
pnpm build   # 全体ビルド
```

## PR前フロー

```
実装(Codex) → Claudeレビュー(git diff) → [必要なら code-review-expert] → Push → PR作成
                     ↑                                                                ↓
                 指摘あれば修正                                        Cloudflare Preview 自動デプロイ
                                                                                       ↓
                                                                             QA(Playwright on Preview URL)
                                                                                       ↓
                                                                             QA結果をPRコメントに投稿
```

指摘・問題があれば修正 → 前段からやり直し。全てクリアしたらマージ。

## QA運用

- テストコード: `apps/web/e2e/` に配置
- ローカル実行: Wrangler dev + Vite dev 起動状態で `pnpm --filter web e2e`
- CI実行: GitHub Actions が PR時に自動実行
- QAシナリオ管理: `docs/qa-scenarios.md`
- 認証: Google OAuthは `storageState` 方式（自動ログイン不可）

## デプロイ

- **Preview**: PRごとにCloudflareが自動発行（Pages/Workers両方）
- **本番**: `main` へのマージで自動デプロイ
- ロールバック: Cloudflareダッシュボード or `wrangler rollback`

# ADR（Architecture Decision Records）

重要な技術的意思決定は `docs/decisions/` にADRとして記録する。

## 作成基準（迷ったら作る）

- 複数の選択肢を比較検討した
- 一見おかしく見えるが意図的な選択
- 後から変更すると影響範囲が大きい（DB設計、認証方式、API設計など）

## ファイル命名

`docs/decisions/NNNN-タイトル.md`（例: `0001-monorepo-with-pnpm-workspaces.md`）

## フォーマット

```markdown
# タイトル

## 状況

なぜこの決定が必要だったか

## 決定

何を選んだか

## 理由

なぜそれを選んだか、却下した選択肢

## 結果

（後から追記）実際どうだったか
```

# 作業分担

このリポジトリでは、Claude Code（本エージェント）と Codex（MCP経由）で作業分担を行う。

## 役割分担

### Claude（プロジェクト管理者）

- ユーザー要求の受け取りと要件整理
- タスク分解と実行計画の策定
- Codexへの作業依頼と成果物レビュー
- 複数タスク・複数ファイルにまたがる統合判断
- コンテキスト管理（過去の議事・設計方針の保持）
- ユーザーとの対話・最終報告

### Codex（実作業者）

- Claudeから依頼された単位のコード読解・実装・修正
- テスト実行、ビルド、Lint等の検証コマンド実行
- 依頼範囲内での事実確認とサマリ返却

原則として、ファイルの書き換えを伴う実装作業はCodexに委譲する。Claudeが直接編集するのは、CLAUDE.mdやADR、設定ファイル等のメタ情報、および軽微な追記に限る。

## Codex 呼び出しの既定

`mcp__codex__codex` / `mcp__codex__codex-reply` を使う際の既定値。

| 項目              | 既定値             | 備考                                 |
| ----------------- | ------------------ | ------------------------------------ |
| `sandbox`         | `workspace-write`  | 調査のみの場合は `read-only` を明示  |
| `approval-policy` | `on-request`       | 自律実行させたい定型作業のみ `never` |
| `cwd`             | プロジェクトルート | 明示指定する                         |

同一タスクの継続対話は必ず `codex-reply` でスレッドを維持する（毎回新規セッションを立てない）。

## Codex への指示テンプレート

Codex呼び出しの `prompt` には、次の4項目を必ず含める。

1. **目的**: なぜこの作業をするか（背景・上位ゴール）
2. **成果物**: 何を作る／変更するか（対象ファイル・関数名など具体的に）
3. **触ってよい範囲**: 変更許可のあるファイル・ディレクトリ、および禁止範囲
4. **完了条件**: 何をもって完了とするか（テスト通過、型チェック通過、特定コマンドの成功など）

## 成果物レビュー

Codexからの完了報告後、Claudeは必ず以下で実変更を確認してから完了扱いにする。

- `git status` で変更ファイル一覧を確認
- `git diff` で差分内容を確認
- Codexのサマリと実差分に乖離がないかを検証

サマリだけを根拠に「完了」とユーザーに報告しない。

## 例外

- ユーザーが明示的に「Claudeが直接やって」と指示した場合はClaudeが実装する
- Codexが応答不能・エラー時はClaudeがフォールバックして実装する（この場合ユーザーに事前告知する）
- 1〜2行の自明な修正（typo・import追加等）はClaudeが直接編集してよい

# 旧repoの参照

旧サービス（https://github.com/u-akihiro/michi_no_eki）は参照許可済み。`gh api repos/u-akihiro/michi_no_eki/...` で仕様確認・ロジック移植のソースとして利用する。

ただし旧repoの本番DBデータは流用しない（データはv2で新規にスクレイピングして収集する）。
