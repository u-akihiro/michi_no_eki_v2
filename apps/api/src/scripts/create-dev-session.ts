import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * ローカル開発用の擬似ログインセッションを作成する dev 専用スクリプト。
 *
 * `vite dev` では Google OAuth ログインが動かないため、認証後の画面
 * （マイページ・チェックイン等）を確認するには、ローカル D1 に
 * セッションを投入してブラウザに `session_id` クッキーを設定する必要がある。
 *
 * このスクリプトは **ローカル D1 (`--local`) 限定** で、OAuth を迂回する
 * 仕組みのため本番では絶対に使わないこと（`--remote` は一切扱わない）。
 *
 *   pnpm --filter api dev:session         セッション作成 + クッキー案内
 *   pnpm --filter api dev:session:clear   dev ユーザーの記録/セッション/ユーザーを削除
 */

const DEV_USER_ID = 'dev-user'
const DEV_SESSION_ID = 'dev-session'
const DEV_GOOGLE_SUB = 'dev-google-sub'
const DEV_EMAIL = 'dev@example.com'
const DEV_NAME = '開発ユーザー'

const DAY_MS = 24 * 60 * 60 * 1000

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function buildCreateSql(): string {
  const now = Date.now()
  const createdAt = now - 90 * DAY_MS
  const expiresAt = now + 365 * DAY_MS

  return [
    `INSERT OR REPLACE INTO users (id, google_sub, email, name, picture_url, created_at, updated_at) VALUES (${sqlText(
      DEV_USER_ID,
    )}, ${sqlText(DEV_GOOGLE_SUB)}, ${sqlText(DEV_EMAIL)}, ${sqlText(
      DEV_NAME,
    )}, NULL, ${createdAt}, ${now});`,
    `INSERT OR REPLACE INTO sessions (id, user_id, created_at, expires_at, revoked_at, user_agent) VALUES (${sqlText(
      DEV_SESSION_ID,
    )}, ${sqlText(DEV_USER_ID)}, ${now}, ${expiresAt}, NULL, ${sqlText(
      'dev-session-script',
    )});`,
  ].join('\n')
}

function buildClearSql(): string {
  return [
    `DELETE FROM checkins WHERE user_id = ${sqlText(DEV_USER_ID)};`,
    `DELETE FROM sessions WHERE user_id = ${sqlText(DEV_USER_ID)};`,
    `DELETE FROM users WHERE id = ${sqlText(DEV_USER_ID)};`,
  ].join('\n')
}

function executeLocalSql(sql: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'michieki-dev-session-'))
  const sqlPath = join(dir, 'dev-session.sql')

  try {
    writeFileSync(sqlPath, `${sql}\n`, 'utf8')

    // ローカル D1 限定。`--remote` は決して付けない。
    const result = spawnSync(
      `pnpm exec wrangler d1 execute michieki_db --local --file "${sqlPath}"`,
      { shell: true, stdio: 'inherit' },
    )

    if (result.status !== 0) {
      throw new Error(`wrangler d1 execute failed (exit ${result.status ?? 1})`)
    }
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

function printLoginHint(): void {
  const setCookie = `document.cookie='session_id=${DEV_SESSION_ID}; path=/'; location.reload()`
  const clearCookie = `document.cookie='session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'; location.reload()`

  console.log('')
  console.log(`✅ ローカル擬似ログインセッションを作成しました（${DEV_NAME}）`)
  console.log('   ブラウザの Console に貼り付けてログイン状態にできます:')
  console.log(`     ${setCookie}`)
  console.log('   解除（ログアウト）:')
  console.log(`     ${clearCookie}`)
  console.log('')
  console.log('   ※ これはローカル D1 のみの dev 用セッションです。')
}

function main(): void {
  const shouldClear = process.argv.slice(2).includes('--clear')

  if (shouldClear) {
    executeLocalSql(buildClearSql())
    console.log('')
    console.log('🧹 dev セッション/ユーザー/記録を削除しました（ローカル D1）')
    return
  }

  executeLocalSql(buildCreateSql())
  printLoginHint()
}

main()
