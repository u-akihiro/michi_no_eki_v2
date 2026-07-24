import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/app-shell/app-shell'
import { MapPage } from './pages/map-page'
import { MyPagePage } from './pages/mypage-page'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<MapPage />} index />
        <Route element={<MyPagePage />} path="mypage" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Route>
    </Routes>
  )
}
