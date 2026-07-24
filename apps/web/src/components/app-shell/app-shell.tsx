import { Outlet } from 'react-router-dom'

import { Header } from './header'

export function AppShell() {
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-text">
      <Header />
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
