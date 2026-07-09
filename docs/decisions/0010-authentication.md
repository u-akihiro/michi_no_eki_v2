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

Google OAuth 2.0（認可コードフロー）のプロトコル処理は **`@hono/oauth-providers` の googleAuth ミドルウェア**に委ねる。

- **責任分界点**: ライブラリ = OAuth プロトコルの正しさ（Google へのリダイレクト、state、code→token 交換、Google プロフィール取得）とその上流セキュリティ修正。**我々** = 検証済み Google ID を受けた後の users upsert / セッション発行 / session_id Cookie / セッション検証 / logout / API の CSRF。
- redirect URI は `/auth/google/callback` に固定（ライブラリの redirect_uri を明示指定）。
- **state(CSRF) はライブラリの責任範囲**に入るため、実装時に「その版が state を保存し callback で検証するか」を確認する。不足時は自前 `oauth_state` Cookie 検証を重ねる（多層防御）。

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
- **@hono/oauth-providers を選ぶ**: 責任分界点が明確（OAuth プロトコルはライブラリ・上流追従、セッション/認可は自前）。公式 Hono パッケージで統合が密。唯一の弱点（state 制御がライブラリ内部）は実装前チェックのゲートで担保。
- **同一オリジンの活用**: 旧repoが CloudFront で達成した同一オリジン化を、v2 は単一 Worker で最初から満たすため、CORS・プロキシ・別オリジン Cookie の複雑さが無い。

### 却下した選択肢

- **JWT（localStorage / Cookie）**: XSS/revoke リスク。ADR-0028 と同じ理由で却下。
- **arctic 等で OAuth を自前配線**: state を自分で持てる利点はあるが、責任分界点の明確さと実装量で @hono/oauth-providers を優先。state 検証が不十分だった場合の切替候補として保持。

## 結果

（後から追記）
