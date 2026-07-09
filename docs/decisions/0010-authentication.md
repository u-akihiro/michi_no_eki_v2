# 認証方式: サーバサイドセッション + Google OAuth（@hono/oauth-providers）

## 状況

MVP 機能B「ユーザーログイン（Google OAuth）」を実装する。スタックは Cloudflare Workers + Hono + D1 + Drizzle。ADR-0007 のとおり web(Static Assets) と api(Hono) は**単一 Worker で同一オリジン**配信される。

旧サービス（u-akihiro/michi_no_eki）は認証を段階的に進化させ、最終的に ADR-0028 で **JWT を廃止し、不透明 session ID + サーバサイドセッション**方式に到達している。v2 はこの結論を初手から採用する。

## 決定

### 認証データモデル

**JWT は使わず、不透明な session_id を HttpOnly Cookie に入れ、実体は D1 の `sessions` テーブルで管理する（BFF パターン）。**

```
Cookie: session_id=<32byte 乱数の base64url>  (HttpOnly, Secure*, SameSite=Lax, Path=/, Max-Age=30day)
                │
                ▼
sessions (D1) ──→ user_id ──→ users (D1)
```

- `users`: id / google_sub(UNIQUE) / email / name / picture_url / created_at / updated_at
- `sessions`: id(=session_id) / user_id / created_at / expires_at / revoked_at(nullable) / user_agent、`expires_at` に index
- session_id は Web Crypto（`crypto.getRandomValues` 32byte）で生成。
- 旧repoの demo 認証（`is_demo` 系）は MVP 対象外のため**除外**。

### OAuth プロトコル

Google OAuth 2.0 / OIDC（認可コードフロー）のプロトコル処理は **`arctic`**（Lucia 作者・セキュリティ志向・Workers 対応）に委ねる。

> **経緯（当初 @hono/oauth-providers を予定→arctic に変更）**: 当初は公式の `@hono/oauth-providers` を「責任分界が明確」として採用予定だったが、実装前チェックで実ソースを確認したところ、認証基盤として不適な defect が判明したため arctic に切り替えた:
>
> - **Google token 交換が非準拠**: `getTokenFromCode` が `content-type: application/json` かつ body のキーが `clientId` / `clientSecret`（camelCase）。Google は `application/x-www-form-urlencoded` + `client_id` / `client_secret`（snake_case）を要求するため、camelCase のクライアント認証情報を認識できず token 交換が失敗する見込み。
> - **state(CSRF) の乱数が非セキュア**: `Math.random()` ベースで生成しており、Cloudflare 公式が security 用途で禁じている手法。
>
> これらはライブラリが「自分の責任範囲（安全な state + 正しい token 交換）」を果たせていないことを意味し、採用理由（信頼できる責任分界）が成立しない。

- **責任分界点**: `arctic` = OAuth2/OIDC プロトコルの正しさ（認可 URL 生成、state/PKCE、code→token 交換、id_token の取得）。**我々** = state/PKCE の保存と検証（arctic のヘルパーで我々が Cookie に保持）、id_token から `sub`/email/name/picture の取得、users upsert / セッション発行 / session_id Cookie / セッション検証 / logout / API の CSRF。
- redirect URI は `/auth/google/callback` に固定。
- **state / PKCE は我々の管理下**（arctic が値を生成、我々が短命 Cookie に保存し callback で照合）。session_id と同様に Web Crypto 由来の安全な値。

### 認証フロー

1. ログイン開始 → Google 認可画面（state 付き）
2. `/auth/google/callback` → state 検証 → token 交換 → Google プロフィール取得 → `users` upsert → `sessions` INSERT（**session fixation 対策で毎回新規 id**）→ session_id Cookie セット → `/` へ
3. `GET /api/me` → Cookie の session_id を `WHERE id=? AND revoked_at IS NULL AND expires_at > now` で検証 → ユーザー情報 or 401
4. `POST /auth/logout` → `sessions.revoked_at = now` + Cookie 削除

### セキュリティ

- Cookie: `HttpOnly` / `SameSite=Lax` / `Path=/` / `Max-Age=30day`。`Secure` は**環境分岐**（本番 HTTPS=on、ローカル HTTP=off）
- OAuth の state による CSRF 対策 + session fixation 対策（成功時に新 id）
- 状態変更系 `/api/*` に Origin/Referer 検証ミドルウェア（`/auth/*` は Google からの GET リダイレクトを受けるため除外）
- 秘密情報: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` は本番=`wrangler secret`、ローカル=`.dev.vars`（gitignore）

### スコープ（MVP）

- 「ログインできる・状態が分かる・ログアウトできる」まで。**地図は引き続き公開**（ログイン不要）。認証を強制するのは `/api/me` と `/auth/*` のみで、他リソースはゲートしない（保護対象機能は将来）。

## 理由

- **JWT を選ばない**: revoke 機構が無く漏洩時に有効期限まで失効不能。単一 backend + 単一 DB では stateless の利点が薄い。セッション方式は即時失効可能。
- **arctic を選ぶ**: OAuth2/OIDC プロトコルを正しく実装した軽量ライブラリ（正しい Google token 交換、state/PKCE、id_token 取得）。state/PKCE は我々が Cookie に保持して検証するため、CSRF 防御の中核を自分でコントロールできる。セッション管理は自前(D1)で持つ。
- **同一オリジンの活用**: 旧repoが CloudFront で達成した同一オリジン化を、v2 は単一 Worker で最初から満たすため、CORS・プロキシ・別オリジン Cookie の複雑さが無い。

### 却下した選択肢

- **JWT（localStorage / Cookie）**: XSS/revoke リスク。ADR-0028 と同じ理由で却下。
- **@hono/oauth-providers**: 責任分界の明確さと実装量で当初有力だったが、実装前チェックで Google token 交換の非準拠（JSON + camelCase の client 認証情報）と state の非セキュア乱数（`Math.random`）が判明し、認証基盤として不適と判断して却下（上記「経緯」参照）。

## 結果

（後から追記）
