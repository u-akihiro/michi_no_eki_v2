import { NavLink } from 'react-router-dom'

import { AuthControl } from '../auth-control'

import { cn } from '@/lib/utils'

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    'text-sm font-medium text-text-muted transition-colors hover:text-primary',
    isActive && 'font-bold text-primary',
  )

export function Header() {
  return (
    <header
      aria-label="アプリヘッダー"
      className="flex h-[60px] shrink-0 items-center gap-5 border-b border-border bg-white px-5"
    >
      <NavLink
        aria-label="みちえき マップへ"
        className="flex shrink-0 items-center gap-3"
        to="/"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-black text-white">
          駅
        </span>
        <span className="text-lg font-black tracking-normal text-text">
          みちえき
        </span>
      </NavLink>

      <div className="relative min-w-0 flex-1">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-text-muted"
        >
          ⌕
        </span>
        <input
          aria-label="道の駅を検索"
          className="h-10 w-full max-w-[454px] rounded-full border border-border bg-slate-50 pl-11 pr-4 text-sm font-medium text-text outline-none transition-colors placeholder:text-text-subtle focus:border-primary"
          placeholder="道の駅を検索"
          readOnly
          type="search"
        />
      </div>

      <nav
        aria-label="グローバルナビゲーション"
        className="hidden shrink-0 items-center gap-6 md:flex"
      >
        <NavLink className={navLinkClassName} end to="/">
          マップ
        </NavLink>
        <NavLink className={navLinkClassName} to="/mypage">
          マイページ
        </NavLink>
      </nav>

      <div className="shrink-0">
        <AuthControl />
      </div>
    </header>
  )
}
