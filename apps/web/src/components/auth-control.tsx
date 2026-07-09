import { useEffect, useState } from 'react'

import { Button } from './ui/button'

type AuthUser = {
  id: string
  email: string
  name: string
  pictureUrl?: string | null
}

type AuthState =
  | { status: 'loading' }
  | { status: 'logged-out' }
  | { status: 'logged-in'; user: AuthUser }

type MeResponse = {
  user: AuthUser
}

export function AuthControl() {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' })
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadCurrentUser() {
      try {
        const response = await fetch('/api/me', {
          signal: controller.signal,
        })

        if (response.status === 401) {
          setAuthState({ status: 'logged-out' })
          return
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = (await response.json()) as MeResponse
        setAuthState({ status: 'logged-in', user: data.user })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setAuthState({ status: 'logged-out' })
      }
    }

    void loadCurrentUser()

    return () => {
      controller.abort()
    }
  }, [])

  function handleLogin() {
    window.location.href = '/auth/google/login'
  }

  async function handleLogout() {
    setIsLoggingOut(true)

    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      setAuthState({ status: 'logged-out' })
    } finally {
      setIsLoggingOut(false)
    }
  }

  if (authState.status === 'loading') {
    return (
      <div className="rounded-md bg-white/95 px-3 py-2 text-sm font-medium text-slate-700 shadow">
        認証状態を確認中...
      </div>
    )
  }

  if (authState.status === 'logged-out') {
    return (
      <Button onClick={handleLogin} type="button">
        Google でログイン
      </Button>
    )
  }

  return (
    <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-md bg-white/95 px-2 py-2 shadow">
      {authState.user.pictureUrl !== null &&
        authState.user.pictureUrl !== undefined && (
          <img
            alt={`${authState.user.name} のアバター`}
            className="h-8 w-8 shrink-0 rounded-full bg-slate-200 object-cover"
            height={32}
            referrerPolicy="no-referrer"
            src={authState.user.pictureUrl}
            width={32}
          />
        )}
      <span className="min-w-0 max-w-40 truncate text-sm font-medium text-slate-900">
        {authState.user.name}
      </span>
      <Button
        disabled={isLoggingOut}
        onClick={() => void handleLogout()}
        size="sm"
        type="button"
      >
        {isLoggingOut ? 'ログアウト中...' : 'ログアウト'}
      </Button>
    </div>
  )
}
