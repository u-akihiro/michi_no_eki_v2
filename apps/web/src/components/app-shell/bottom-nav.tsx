import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/utils'

const bottomNavLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-14 flex-1 flex-col items-center justify-center gap-1 text-text-muted transition-colors hover:text-primary',
    isActive && 'text-primary',
  )

function MapIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[22px] w-[22px]"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M9 18.5 4.5 20V6L9 4.5m0 14 6-2m-6 2v-14m6 12L19.5 15V1L15 2.5m0 14v-14m0 0-6 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 9.5c0 1.75-2.5 4.5-2.5 4.5S7 11.25 7 9.5a2.5 2.5 0 0 1 5 0Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="9.5" cy="9.5" fill="currentColor" r="0.8" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[22px] w-[22px]"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M4.5 20a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function BottomNav() {
  return (
    <nav
      aria-label="モバイルナビゲーション"
      className="shrink-0 border-t border-border bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex">
        <NavLink className={bottomNavLinkClassName} end to="/">
          <MapIcon />
          <span className="text-[11px] font-bold leading-none">マップ</span>
        </NavLink>
        <NavLink className={bottomNavLinkClassName} to="/mypage">
          <UserIcon />
          <span className="text-[11px] font-bold leading-none">マイページ</span>
        </NavLink>
      </div>
    </nav>
  )
}
