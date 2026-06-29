// App.jsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/Authcontext.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import Home from './pages/Home.jsx';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';
import Admin from './pages/Admin.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Help from './pages/Help.jsx';
import Shop from './pages/Shop.jsx';
import ErrorPage from './pages/Error.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';

function GuestOnlyRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (user) {
    return <Navigate to="/lobby" replace />;
  }

  return children;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route
          path="/"
          element={(
            <GuestOnlyRoute>
              <Home />
            </GuestOnlyRoute>
          )}
        />
        <Route
          path="/lobby"
          element={(
            <ProtectedRoute>
              <Lobby />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/game"
          element={(
            <ProtectedRoute>
              <Game />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/game/:code"
          element={(
            <ProtectedRoute>
              <Game />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/admin"
          element={(
            <ProtectedRoute>
              <AdminRoute>
                <Admin />
              </AdminRoute>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/login"
          element={(
            <GuestOnlyRoute>
              <Login />
            </GuestOnlyRoute>
          )}
        />
        <Route
          path="/profile"
          element={(
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/leaderboard"
          element={(
            <ProtectedRoute>
              <Leaderboard />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/help"
          element={(
            <ProtectedRoute>
              <Help />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/shop"
          element={(
            <ProtectedRoute>
              <Shop />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/error"
          element={(
            <ProtectedRoute>
              <ErrorPage />
            </ProtectedRoute>
          )}
        />
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
export default App;