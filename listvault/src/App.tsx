import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import SignIn from './pages/SignIn'
import Home from './pages/Home'
import ListDetail from './pages/ListDetail'
import Join from './pages/Join'
import Archive from './pages/Archive'
import Search from './pages/Search'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Notes from './pages/Notes'
import NoteEditor from './pages/NoteEditor'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Join links work signed-out (preview + sign-in-to-join, PRD 5.2) */}
        <Route path="/j/:code" element={<Join />} />
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
