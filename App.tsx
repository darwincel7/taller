
import React from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Intake } from './pages/Intake';
import { OrderList } from './pages/OrderList';
import { OrderDetails } from './pages/OrderDetails';
import { ClientView } from './pages/ClientView';
import { Login } from './pages/Login';
import { TeamManagement } from './pages/TeamManagement';
import { ActivityLog } from './pages/ActivityLog';
import { StoreStock } from './pages/StoreStock';
import { Inventory } from './pages/Inventory';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { CashRegister } from './pages/CashRegister';
import { WorkshopAudit } from './pages/WorkshopAudit';
import { MobileVideoUpload } from './pages/MobileVideoUpload';
import { OrderProvider } from './contexts/OrderContext';
import { InventoryProvider } from './contexts/InventoryContext'; 
import { CashProvider } from './contexts/CashContext'; 
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  const { currentUser, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Layout>{children}</Layout>;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <OrderProvider>
        <InventoryProvider>
          <CashProvider>
            <HashRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/client" element={<ClientView />} />
                <Route path="/mobile-upload/:sessionId" element={<MobileVideoUpload />} />
                
                <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/store" element={<ProtectedRoute><StoreStock /></ProtectedRoute>} />
                <Route path="/intake" element={<ProtectedRoute><Intake /></ProtectedRoute>} />
                <Route path="/orders" element={<ProtectedRoute><OrderList /></ProtectedRoute>} />
                <Route path="/orders/:id" element={<ProtectedRoute><OrderDetails /></ProtectedRoute>} />
                <Route path="/team" element={<ProtectedRoute><TeamManagement /></ProtectedRoute>} />
                <Route path="/activity" element={<ProtectedRoute><ActivityLog /></ProtectedRoute>} />
                <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
                <Route path="/wiki" element={<ProtectedRoute><KnowledgeBase /></ProtectedRoute>} />
                <Route path="/cash" element={<ProtectedRoute><CashRegister /></ProtectedRoute>} />
                <Route path="/audit" element={<ProtectedRoute><WorkshopAudit /></ProtectedRoute>} />
                
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </HashRouter>
          </CashProvider>
        </InventoryProvider>
      </OrderProvider>
    </AuthProvider>
  );
};

export default App;