import { NavLink } from 'react-router-dom'

import { AuthControl } from '../auth-control'

import { useStationSearch } from '@/contexts/station-search-context'
import { cn } from '@/lib/utils'

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    'text-sm font-medium text-text-muted transition-colors hover:text-primary',
    isActive && 'font-bold text-primary',
  )

export function Header() {
  const { query, setQuery, submitSearch } = useStationSearch()

  return (
    <header
      aria-label="アプリヘッダー"
      className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-b border-border bg-white px-5 py-3 md:h-[60px] md:flex-nowrap md:py-0"
    >
      <NavLink
        aria-label="みちえき マップへ"
        className="order-1 flex shrink-0 items-center gap-3"
        to="/"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-black text-white">
          駅
        </span>
        <span className="text-lg font-black tracking-normal text-text">
          みちえき
        </span>
      </NavLink>

      <div className="relative order-3 w-full md:order-2 md:min-w-0 md:flex-1">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-text-muted"
        >
          ⌕
        </span>
        <input
          aria-label="道の駅を検索"
          className="h-10 w-full max-w-[454px] rounded-full border border-border bg-slate-50 pl-11 pr-4 text-sm font-medium text-text outline-none transition-colors placeholder:text-text-subtle focus:border-primary"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              submitSearch(event.currentTarget.value)
            }
          }}
          placeholder="道の駅を検索"
          type="search"
          value={query}
        />
      </div>

      <nav
        aria-label="グローバルナビゲーション"
        className="order-4 hidden shrink-0 items-center gap-6 md:order-3 md:flex"
      >
        <NavLink className={navLinkClassName} end to="/">
          マップ
        </NavLink>
        <NavLink className={navLinkClassName} to="/mypage">
          マイページ
        </NavLink>
      </nav>

      <div className="order-2 ml-auto shrink-0 md:order-4 md:ml-0">
        <AuthControl />
      </div>
    </header>
  )
}
