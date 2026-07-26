# Cloudflare Preview（非本番ブランチ）デプロイを廃止する

## 状況

ADR-0006 で開発サイクルを定めた際、Cloudflare の **Preview Deployments**（PRごとに非本番ブランチを自動デプロイし Preview URL を発行）を採用し、「Preview URL に対して QA（Playwright）を実行する」フローを描いていた。

しかし運用に入ると、この前提が成立しないことが判明した。

- **Preview URL では Google OAuth が動作しない**。認証（ADR-0010）は redirect URI を `/auth/google/callback` に固定し、Google 側にも本番ドメインの redirect URI のみを登録している。Preview は毎回異なる一時ドメインで発行されるため、そこからの OAuth リダイレクトは Google 側で拒否される。結果、Preview 上ではログインを伴う画面・機能の確認ができない。
- 認証を伴う確認はすでに**ローカル**（`wrangler dev` + `apps/api` の `dev:session` 擬似セッション、ADR-0007 / QA運用参照）に寄せており、Preview を使う実務上の動機がない。
- さらに Preview（Workers Builds の非本番ブランチデプロイ）は**実デプロイのバインディング検証**を PR 段階で走らせるため、新しい binding を追加すると PR が失敗する副作用がある（#73 の写真基盤 PR で、R2 バケット未整備により Preview ビルドが失敗して顕在化）。得られる価値が無いのに PR を止める要因になっている。

## 決定

**Cloudflare の Preview（非本番ブランチ）デプロイを廃止する。**

- Cloudflare Workers Builds の **Branch control を本番ブランチ `main` のみ**に限定し、非本番ブランチの自動ビルド/デプロイを無効化する（ダッシュボード設定）。
- **PR の自動検証は GitHub Actions に集約**する: `typecheck` / `lint` / `format` / `build`（`.github/workflows/ci.yml`）。これは Preview に依存しておらず、変更不要。
- **認証を伴う動作確認・E2E はローカル**で行う: `wrangler dev`（＋ Vite dev）に対して実施し、ログインが要る画面は `pnpm --filter api dev:session` の擬似セッションで確認する。
- **本番デプロイは従来どおり** `main` マージで Cloudflare が自動デプロイ（ADR-0006 のマージ後デプロイは維持）。

ADR-0006 の該当記述（プレビュー環境節・全体フロー図の Preview/QA-on-Preview・理由の Preview 関連）は本 ADR で撤回する（ADR-0006 の「結果」にも追記済み）。

## 理由

- **Preview の主目的（PRごとの動作確認）が認証制約で成立しない**。ログインが絡む機能が MVP の中核（OAuth・チェックイン・マイページ）であり、認証不可の Preview では実質的な確認ができない。
- **ローカル確認で代替できている**。`wrangler dev` は D1・R2（疑似）・Assets を含めてほぼ本番同等に動き、擬似セッションで認証後画面も確認できる。
- **PR を止める副作用の除去**。binding 追加のたびに Preview 実デプロイが検証で失敗するのは、価値の無いゲートで開発を阻害する。
- **Preview/本番のリソース分離が不要になる**。Preview を持たないため、preview 用 D1・R2 バケットや `[env.preview]` 環境分離（単一 Worker 統合構成では D1・ASSETS の二重定義を伴い高コスト）を設ける必要がなくなり、構成が単純化する。

### 却下した選択肢

- **Preview を維持し、OAuth を Preview 対応にする**: Google 側に多数の一時ドメイン redirect URI を登録する／ワイルドカードを使う等が必要でセキュリティ的に不適切、かつ毎回変わる Preview ドメインを管理し切れない。労力に見合わない。
- **Preview は残すが認証機能だけローカル確認**: Preview と本番でリソース分離の管理コストが残り、binding 追加時の PR 失敗も解消しない。中途半端。

## 結果

（後から追記）
