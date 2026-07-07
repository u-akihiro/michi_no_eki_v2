# Cloudflare Workers-only デプロイトポロジーを採用する

## 状況

初期方針として、フロントエンド (`apps/web`) を Cloudflare Pages に、バックエンドAPI (`apps/api`) を Cloudflare Workers にデプロイする「Pages + Workers 分離構成」を計画していた。ADR-0002 で Hono on Workers を決定し、`apps/web` は Vite + React SPA として Pages で配信する想定だった。

しかし、Cloudflare は 2024 年に **Workers Static Assets** を GA し、単一の Worker で SPA と API を同時に配信できるようになった。あわせて Cloudflare は「Workers-first」を戦略として明言し、Pages は徐々に非推奨化される流れがある。

MVP 実装を開始する直前の今、以下を再検討する必要が生じた:

- Cloudflare の将来方針との整合
- CORS 設定・複数デプロイの管理コスト
- Preview URL の複数化による PR 検証の煩雑さ

## 決定

**`apps/web` と `apps/api` を 1 つの Cloudflare Worker として統合デプロイする。**

具体的な構成:

- `apps/web` の Vite ビルド成果物を **Workers Static Assets** として配信
- `apps/api` の Hono ルートを `/api/*` プレフィックス配下で提供
- ルーティング:
  - `/api/*` → Worker (Hono) が処理
  - それ以外 → Static Assets が処理、404 は SPA fallback で `index.html` を返す（`not_found_handling = "single-page-application"`）

ビルドオーケストレーション:

- ルート `package.json` の build script で以下を順に実行:
  1. `apps/web` の Vite build
  2. `apps/web/dist` を `apps/api/dist/assets` にコピー
  3. `apps/api` の Wrangler build

モノレポ規律（ADR-0001）の維持:

- ソースレベルの相互 import 禁止は継続
- デプロイ時の依存（`apps/web` の build 出力を `apps/api` の assets として使う）は build orchestration で解決。ソースコードでの相互参照は発生しない

## 理由

### Workers-only を選ぶ理由

1. **Cloudflare の将来方針との整合**
   - Pages は今後非推奨化される流れがあり、後日移行コストが発生するリスクを回避
   - Cloudflare 側で「新規プロジェクトは Workers with Static Assets を推奨」と明言されている
2. **CORS 設定不要**
   - 同一 origin で web と api が動くため、Google OAuth リダイレクトや API 呼び出しでの CORS 設定が不要
3. **単一 Preview URL**
   - PR ごとの動作確認が 1 URL で完結、フロント/バックエンド間の連携動作を確認しやすい
4. **bindings 直結**
   - D1 / R2 の bindings が Worker に直付けされるため、web → api 間の間接呼び出しが不要
   - MVP 実装で D1 / R2 を導入する際の設計が簡素化される
5. **デプロイ運用の単純化**
   - Cloudflare 側で管理するプロジェクトが 1 つで済む
6. **MVP 直前で切替コストが最小**
   - `apps/web` は Hello World レベル、`apps/api` も同様なので、方針変更のコードコストが低い
   - 実装が進んでからの切替はコストが跳ね上がる

### 却下した選択肢

- **A. Pages + Workers 分離継続**
  - Cloudflare の方針と逆行
  - CORS 設定・複数 Preview URL・複数デプロイ管理のコストが継続
  - Pages 非推奨化時の移行コストが将来発生しうる
- **B. `apps/api` の wrangler.toml から `../web/dist` を直接参照**
  - build 時の apps/api → apps/web 依存が暗黙的に発生
  - ADR-0001 の「apps/\* 同士の相互 import 禁止」規律に抵触するグレーな構成
  - build orchestration で明示的にコピーする案（採用）の方がクリーン

### モノレポ規律への影響

ADR-0001 で定めた 4 規律のうち、「apps/\* 同士の相互 import 禁止」は **ソースコードレベル** の規律。build orchestration で `apps/web/dist` を `apps/api/dist/assets` にコピーする処理は、build 時の deploy 統合であり、ソースコード上の相互参照ではない。

「独立ビルド」も維持される: `apps/web` は自身の `pnpm --filter @michi-no-eki/web build` で完結、`apps/api` は自身の Wrangler build で完結。統合は root の build script が担う。

### 命名について

Worker 名は `michi-no-eki`（旧 `michi-no-eki-api` から変更）。統合後は API 専用ではないため、より広い名前にする。

## 結果

（後から追記）
