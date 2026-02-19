import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TicketList from './pages/TicketList';
import TicketCreate from './pages/TicketCreate';
import TicketDetail from './pages/TicketDetail';
import TicketEdit from './pages/TicketEdit';
import MyTickets from './pages/MyTickets';
import KanbanBoard from './pages/KanbanBoard';
import ChangePassword from './pages/ChangePassword';
import AIChat from './pages/AIChat';
import './App.css';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Cargando...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Cargando...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets"
        element={
          <ProtectedRoute>
            <TicketList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-tickets"
        element={
          <ProtectedRoute>
            <MyTickets />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/new"
        element={
          <ProtectedRoute>
            <TicketCreate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/:id"
        element={
          <ProtectedRoute>
            <TicketDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/:id/edit"
        element={
          <ProtectedRoute>
            <TicketEdit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kanban"
        element={
          <ProtectedRoute>
            <KanbanBoard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePassword />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-chat"
        element={
          <ProtectedRoute>
            <AIChat />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app">
          <AppRoutes />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
