import { AuthControl } from './components/auth-control'
import { StationMap } from './components/station-map'

export default function App() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-100">
      <StationMap />
      <div className="absolute right-3 top-3 z-[1000]">
        <AuthControl />
      </div>
    </main>
  )
}
