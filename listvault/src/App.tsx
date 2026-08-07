import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { SpaceProvider, useSpace } from './context/SpaceContext'
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
import Money from './pages/Money'
import CalendarPage from './pages/CalendarPage'
import NoteEditor from './pages/NoteEditor'
import JoinSpace from './pages/JoinSpace'
import NoSpaces from './pages/NoSpaces'
import SpaceMembers from './pages/SpaceMembers'
import ResetPassword from './pages/ResetPassword'

/** Everything behind auth: join links first, then the space-gated app. */
function AuthedApp() {
  const { space, isCouple, loading } = useSpace()

  return (
    <Routes>
      <Route path="/join/:code" element={<JoinSpace />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route
        path="*"
        element={
          loading ? (
            <div className="flex min-h-[100dvh] items-center justify-center text-slate-400">Loading…</div>
          ) : !space ? (
            <NoSpaces />
          ) : (
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/list/:id" element={<ListDetail />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/notes/:id" element={<NoteEditor />} />
                <Route path="/habits" element={<Habits />} />
                <Route path="/us" element={isCouple ? <Us /> : <Navigate to="/" replace />} />
                <Route path="/money" element={<Money />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/memories" element={<Navigate to={isCouple ? '/us' : '/'} replace />} />
                <Route path="/space" element={<SpaceMembers />} />
                <Route path="/archive" element={<Archive />} />
                <Route path="/search" element={<Search />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<Admin />} />
              </Routes>
            </Layout>
          )
        }
      />
    </Routes>
  )
}

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-slate-400">Loading…</div>
    )
  }

  return (
    <BrowserRouter>
      {session ? (
        <SpaceProvider>
          <AuthedApp />
        </SpaceProvider>
      ) : (
        <Routes>
          <Route path="*" element={<SignIn />} />
        </Routes>
      )}
    </BrowserRouter>
  )
}
