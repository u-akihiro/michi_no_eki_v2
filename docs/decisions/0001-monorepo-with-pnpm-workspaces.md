# pnpm workspaces によるモノレポ構成を採用する

## 状況

道の駅v2は複数の実行単位を持つ:

- `apps/api`: Cloudflare Workers 上のバックエンドAPI（Hono）
- `apps/web`: Cloudflare Pages 上のフロントエンド（React + Vite）
- `apps/scraper`: michi-no-eki.jp からのマスターデータ収集スクリプト

これらを単一リポジトリで管理するか、複数リポジトリに分けるかを決定する必要がある。

旧repo（u-akihiro/michi_no_eki）はモノレポ構成で `frontend/` `backend/` `lambda/` `playwright/` を同居させていた。

## 決定

**pnpm workspaces によるモノレポで開始する。** 構成:

```
michi_no_eki_v2/
├── apps/
│   ├── api/         # Workers + Hono
│   ├── web/         # Pages + React + Vite
│   └── scraper/     # データ取得スクリプト
├── packages/
│   └── shared/      # 型定義・zodスキーマ・定数
├── docs/
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

将来トラフィック増加や組織拡大の必要が発生した場合、リポジトリ分割を再検討する。分割を可能な限り低コストにするため、以下の4規律を初期から守る:

1. `apps/*` 同士の相互import禁止
2. 共有コード（型・zodスキーマ・定数）は `packages/shared` に配置
3. 各appが独立したビルド・テスト・デプロイで完結する
4. web ↔ api の通信は HTTP（Hono RPC or OpenAPI）に限定

## 理由

### モノレポを選ぶ理由

- 個人開発規模で複数リポジトリを維持するオーバーヘッドが不要
- 型定義・スキーマの共有が容易（`packages/shared` 経由）
- 一括での依存更新・CI設定が可能
- 旧repoの構成に近く、開発者の認知負荷が低い

### 4規律を設ける理由

将来「apiだけ別チームに引き渡す」「webだけ独立リリースサイクルにする」といった要件が発生したとき、分割コストを最小化するため。相互import・共有ロジックが `apps/` 内に散らばると、Git履歴分割・パッケージ切り出しの手間が増える。

### モジュラーモノリスではない

`apps/api` と `apps/web` は最初から独立デプロイされる別プロセスであり、HTTP通信で連携する。これはモジュラーモノリス（1プロセス内でモジュール分割）とは異なる「マルチアプリ・モノレポ」構成。

### 却下した選択肢

- **複数リポジトリで開始**: 個人開発段階でのオーバーヘッドが大きい。CI・依存管理・型共有が煩雑
- **単一appでの実装（Workers Pagesで一体化）**: フロントとバックの責務分離が曖昧になり、Cloudflareの各プロダクト（Workers / Pages）の適材適所を活かせない

## 結果

（後から追記）
