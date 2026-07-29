import { Outlet } from 'react-router-dom'

import { BottomNav } from './bottom-nav'
import { Header } from './header'

import { AuthProvider } from '@/contexts/auth-context'
import { StationSearchProvider } from '@/contexts/station-search-context'

export function AppShell() {
  return (
    <AuthProvider>
      <StationSearchProvider>
        <div className="flex h-dvh min-h-0 flex-col bg-background text-text">
          <Header />
          <main className="min-h-0 flex-1">
            <Outlet />
          </main>
          <BottomNav />
        </div>
      </StationSearchProvider>
    </AuthProvider>
  )
}
