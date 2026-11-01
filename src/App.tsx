import { HashRouter, NavLink, Route, Routes } from 'react-router'
import { TodayPage } from './pages/Today'
import { PracticePage } from './pages/Practice'
import { PlaygroundPage } from './pages/Playground'
import { LibraryPage } from './pages/Library'
import { StatsPage } from './pages/Stats'
import { CheatsheetPage } from './pages/Cheatsheet'
import { SettingsPage } from './pages/Settings'
import { useProgress } from './progress/store'

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Today', end: true },
  { to: '/library', label: 'Library' },
  { to: '/playground', label: 'Playground' },
  { to: '/stats', label: 'Stats' },
  { to: '/cheatsheet', label: 'Cheat sheet' },
  { to: '/settings', label: 'Settings' },
]

function Shell() {
  const streak = useProgress((s) => s.streak())
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-surface-1 bg-base/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-mono text-lg font-bold text-green">
            <span className="rounded bg-surface-1 px-1.5 py-0.5 text-sm">:w</span>
            vimprove
          </NavLink>
          <nav className="flex flex-1 items-center gap-1 text-sm">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 transition ${isActive ? 'bg-surface-1 text-text' : 'text-subtext hover:text-text'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1 text-sm" title="Day streak">
            <span>🔥</span>
            <span className="font-semibold">{streak}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/practice/*" element={<PracticePage />} />
          <Route path="/playground" element={<PlaygroundPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/cheatsheet" element={<CheatsheetPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<TodayPage />} />
        </Routes>
      </main>
      <footer className="border-t border-surface-1 py-4 text-center text-xs text-overlay">
        vimprove · daily Vim practice · progress is stored in this browser
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
