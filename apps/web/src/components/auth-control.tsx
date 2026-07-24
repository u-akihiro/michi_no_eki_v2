import { Button } from './ui/button'

import { useAuth } from '@/contexts/auth-context'

export function AuthControl() {
  const { authState, isLoggingOut, login, logout } = useAuth()

  if (authState.status === 'loading') {
    return (
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-text-muted">
        認証状態を確認中...
      </div>
    )
  }

  if (authState.status === 'logged-out') {
    return (
      <Button onClick={login} type="button">
        Google でログイン
      </Button>
    )
  }

  return (
    <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2">
      {authState.user.pictureUrl !== null &&
        authState.user.pictureUrl !== undefined && (
          <img
            alt={`${authState.user.name} のアバター`}
            className="h-9 w-9 shrink-0 rounded-full border-[1.5px] border-primary bg-slate-200 object-cover"
            height={36}
            referrerPolicy="no-referrer"
            src={authState.user.pictureUrl}
            width={36}
          />
        )}
      <span className="min-w-0 max-w-40 truncate text-sm font-medium text-text">
        {authState.user.name}
      </span>
      <Button
        disabled={isLoggingOut}
        onClick={() => void logout()}
        size="sm"
        type="button"
        variant="ghost"
      >
        {isLoggingOut ? 'ログアウト中...' : 'ログアウト'}
      </Button>
    </div>
  )
}
