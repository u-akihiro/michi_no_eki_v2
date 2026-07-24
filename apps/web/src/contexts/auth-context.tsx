import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type AuthUser = {
  id: string
  email: string
  name: string
  pictureUrl?: string | null
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'logged-out' }
  | { status: 'logged-in'; user: AuthUser }

type MeResponse = {
  user: AuthUser
}

type AuthContextValue = {
  authState: AuthState
  isLoggingOut: boolean
  login: () => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
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

  function login() {
    window.location.href = '/auth/google/login'
  }

  async function logout() {
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

  const value = useMemo(
    () => ({ authState, isLoggingOut, login, logout }),
    [authState, isLoggingOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (context === null) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
