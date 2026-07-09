import {
  Google,
  decodeIdToken,
  generateCodeVerifier,
  generateState,
} from 'arctic'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import type { createDb } from './db/client'
import { sessions, users } from './db/schema'
import type { Env } from './env'

const OAUTH_STATE_COOKIE = 'oauth_state'
const OAUTH_CODE_VERIFIER_COOKIE = 'oauth_code_verifier'
const SESSION_COOKIE = 'session_id'
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000

type Db = ReturnType<typeof createDb>
type AppContext = Context<{ Bindings: Env }>

type GoogleClaims = {
  sub: string
  email: string
  name?: string
  picture?: string
}

export const createGoogleClient = (c: AppContext) => {
  const origin = new URL(c.req.url).origin
  return new Google(
    c.env.GOOGLE_CLIENT_ID,
    c.env.GOOGLE_CLIENT_SECRET,
    `${origin}/auth/google/callback`,
  )
}

export const startGoogleLogin = (c: AppContext) => {
  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const secure = isHttps(c)

  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'Lax',
    secure,
  })
  setCookie(c, OAUTH_CODE_VERIFIER_COOKIE, codeVerifier, {
    httpOnly: true,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'Lax',
    secure,
  })

  const authorizationUrl = createGoogleClient(c).createAuthorizationURL(
    state,
    codeVerifier,
    ['openid', 'email', 'profile'],
  )
  return c.redirect(authorizationUrl.toString())
}

export const completeGoogleLogin = async (c: AppContext, db: Db) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, OAUTH_STATE_COOKIE)
  const codeVerifier = getCookie(c, OAUTH_CODE_VERIFIER_COOKIE)

  if (
    !code ||
    !state ||
    !storedState ||
    state !== storedState ||
    !codeVerifier
  ) {
    clearOauthCookies(c)
    throw new HTTPException(400, { message: 'Invalid OAuth callback' })
  }

  const tokens = await createGoogleClient(c).validateAuthorizationCode(
    code,
    codeVerifier,
  )
  const claims = parseGoogleClaims(tokens.idToken())
  const now = Date.now()
  const expiresAt = now + SESSION_TTL_MS

  const [user] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      googleSub: claims.sub,
      email: claims.email,
      name: claims.name ?? null,
      pictureUrl: claims.picture ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: {
        email: claims.email,
        name: claims.name ?? null,
        pictureUrl: claims.picture ?? null,
        updatedAt: now,
      },
    })
    .returning({
      id: users.id,
    })

  if (!user) {
    throw new HTTPException(500, { message: 'Failed to upsert user' })
  }

  const sessionId = generateSessionId()
  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    createdAt: now,
    expiresAt,
    revokedAt: null,
    userAgent: c.req.header('user-agent') ?? null,
  })

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'Lax',
    secure: isHttps(c),
  })
  clearOauthCookies(c)

  return c.redirect('/')
}

export const getCurrentUser = async (c: AppContext, db: Db) => {
  const sessionId = getCookie(c, SESSION_COOKIE)
  if (!sessionId) {
    return null
  }

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      pictureUrl: users.pictureUrl,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, Date.now()),
      ),
    )
    .limit(1)

  return row ?? null
}

export const logout = async (c: AppContext, db: Db) => {
  const sessionId = getCookie(c, SESSION_COOKIE)
  if (sessionId) {
    await db
      .update(sessions)
      .set({ revokedAt: Date.now() })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
}

export const csrfProtection = (): MiddlewareHandler<{ Bindings: Env }> => {
  return async (c, next) => {
    if (isSafeMethod(c.req.method)) {
      await next()
      return
    }

    const requestOrigin = new URL(c.req.url).origin
    const origin = c.req.header('origin')
    if (origin) {
      if (origin !== requestOrigin) {
        return c.json({ error: 'forbidden' }, 403)
      }
      await next()
      return
    }

    const refererOrigin = getOrigin(c.req.header('referer'))
    if (refererOrigin !== requestOrigin) {
      return c.json({ error: 'forbidden' }, 403)
    }

    await next()
  }
}

export const generateSessionId = () => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

const parseGoogleClaims = (idToken: string): GoogleClaims => {
  const claims = decodeIdToken(idToken)
  if (
    !isRecord(claims) ||
    typeof claims.sub !== 'string' ||
    typeof claims.email !== 'string'
  ) {
    throw new HTTPException(400, { message: 'Invalid Google ID token claims' })
  }

  return {
    sub: claims.sub,
    email: claims.email,
    name: typeof claims.name === 'string' ? claims.name : undefined,
    picture: typeof claims.picture === 'string' ? claims.picture : undefined,
  }
}

const clearOauthCookies = (c: AppContext) => {
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' })
  deleteCookie(c, OAUTH_CODE_VERIFIER_COOKIE, { path: '/' })
}

const isHttps = (c: AppContext) => new URL(c.req.url).protocol === 'https:'

const getOrigin = (url: string | undefined) => {
  if (!url) {
    return null
  }
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

const isSafeMethod = (method: string) =>
  method === 'GET' || method === 'HEAD' || method === 'OPTIONS'

const isRecord = (value: object): value is Record<string, unknown> =>
  value !== null && !Array.isArray(value)

const base64UrlEncode = (bytes: Uint8Array) => {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}
