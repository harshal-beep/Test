import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import SignIn from './pages/SignIn'
import Home from './pages/Home'
import ListDetail from './pages/ListDetail'
import Archive from './pages/Archive'
import Search from './pages/Search'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Notes from './pages/Notes'
import Habits from './pages/Habits'
import Us from './pages/Us'
import NoteEditor from './pages/NoteEditor'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-slate-400">Loading…</div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {session ? (
          <Route
            path="*"
            element={
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/list/:id" element={<ListDetail />} />
                  <Route path="/notes" element={<Notes />} />
                  <Route path="/notes/:id" element={<NoteEditor />} />
                  <Route path="/habits" element={<Habits />} />
                  <Route path="/us" element={<Us />} />
                  <Route path="/memories" element={<Navigate to="/us" replace />} />
                  <Route path="/archive" element={<Archive />} />
                  <Route path="/search" element={<Search />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/admin" element={<Admin />} />
                </Routes>
              </Layout>
            }
          />
        ) : (
          <Route path="*" element={<SignIn />} />
        )}
      </Routes>
    </BrowserRouter>
  )
}
