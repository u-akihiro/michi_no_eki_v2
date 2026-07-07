# バックエンドフレームワークに Hono を採用する

## 状況

道の駅v2のバックエンドAPIをCloudflare Workers上で実装する。旧repoは Go + Echo で構築されていたが、v2では言語をTypeScriptに統一する方針（Workers/Pagesがファーストクラス対応、モノレポ内でフロントと型共有可能）。

Workers上のTypeScript Webフレームワークの選定が必要。

## 決定

**Hono を採用する。** 特に以下を採用理由の中心とする:

- Cloudflare Workers向けにネイティブ最適化されている
- Express/Echo風のシンプルなルーティングAPI
- 型安全なミドルウェア・バリデーション（Zodと組合せ）
- Hono RPCによりフロント（React）との型共有が容易
- 軽量（バンドルサイズが小さくWorkersのCold Start要件に適合）

## 理由

### Honoを選ぶ理由

1. **Cloudflare Workers公式推奨レベルの相性**
   - Workers runtime（workerd）を第一クラスターゲットとして開発されている
   - `wrangler dev` との統合がスムーズ
2. **Echo/Expressに近いAPI設計**
   - 旧repo（Echo）の設計思想を移植しやすい
   - 学習コストが低い（AIによる実装効率も高い）
3. **型安全性**
   - `hono/zod-validator` でリクエストバリデーション → ハンドラ内で型付きアクセス
   - Hono RPC でクライアント（React側）に型を出力可能
4. **エコシステム**
   - `@hono/oauth-providers` でGoogle OAuth実装が容易
   - Drizzle ORMとの併用パターンが確立
5. **バンドルサイズ**
   - Workersのバンドルサイズ制約（無料枠1MB、有料枠10MB）に有利

### 却下した選択肢

- **Cloudflare Workers 素のfetch handler**
  - ルーティング・ミドルウェアを自前実装する必要があり、実装コストが高い
  - MVP以降の機能追加でルート数が増えると保守困難
- **itty-router**
  - 超軽量だが、バリデーション・ミドルウェアの標準化が弱い
  - Hono に比べエコシステムが小さい
- **worktop**
  - Workers向けだが、Honoに比べ更新頻度・コミュニティ規模で見劣り
- **Next.js API Routes (on Pages)**
  - フロント・API統合は可能だが、apps/api を独立させる方針（ADR-0001）と合わない
  - Workers特化機能（D1バインディング、Cron等）の扱いが遠回りになる

## 結果

（後から追記）
