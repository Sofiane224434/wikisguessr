// App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
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
        <Route path="/" element={<Home />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/game" element={<Game />} />
        <Route
          path="/admin"
          element={(
            <AdminRoute>
              <Admin />
            </AdminRoute>
          )}
        />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/help" element={<Help />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/error" element={<ErrorPage />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
export default App;