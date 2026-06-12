// ============================================================
// Main Application Entrypoint & Router
// ============================================================

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './providers/AuthProvider';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';

import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { api } from './services/api';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Resources from './pages/Resources';
import Monitoring from './pages/Monitoring';
import Actions from './pages/Actions';
import Incidents from './pages/Incidents';
import AiAssistant from './pages/AiAssistant';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Security from './pages/Security';
import RiskManagement from './pages/RiskManagement';

export default function App() {
  const { isAuthenticated, isLoading } = useAuth();
  const { subscriptions, setSubscriptions, activeSubscriptionId, setActiveSubscription, setResources } = useAppStore();

  useEffect(() => {
    if (isAuthenticated) {
      const loadSubscriptions = async () => {
        try {
          const subs = await api.get<any[]>('/api/subscriptions');
          setSubscriptions(subs);
          if (subs.length > 0 && !activeSubscriptionId) {
            setActiveSubscription(subs[0].id);
          }
        } catch (err) {
          console.error('Failed to load subscriptions globally:', err);
        }
      };
      loadSubscriptions();
    }
  }, [isAuthenticated, activeSubscriptionId, setSubscriptions, setActiveSubscription]);

  useEffect(() => {
    if (isAuthenticated && activeSubscriptionId) {
      const loadResources = async () => {
        try {
          const res = await api.get<any[]>('/api/resources', { params: { subscriptionId: activeSubscriptionId } });
          setResources(res);
        } catch (err) {
          console.error('Failed to load resources globally:', err);
        }
      };
      loadResources();
    }
  }, [isAuthenticated, activeSubscriptionId, setResources]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="pulse-ring">
          <div style={{
            width: 28, height: 28,
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr', gap: 3, borderRadius: 6, overflow: 'hidden',
          }}>
            <span style={{ background: '#0078d4', borderRadius: 2 }} />
            <span style={{ background: '#00B7C3', borderRadius: 2 }} />
            <span style={{ background: '#107C10', borderRadius: 2 }} />
            <span style={{ background: '#FFB900', borderRadius: 2 }} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>
            Azure CloudOps
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 4 }}>
            Connecting to Microsoft Entra ID…
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Header />
        <main className="page-content">
          <Routes>
            <Route path="/"           element={<Dashboard />} />
            <Route path="/resources"  element={<Resources />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/actions"    element={<Actions />} />
            <Route path="/incidents"  element={<Incidents />} />
            <Route path="/security"   element={<Security />} />
            <Route path="/risk"       element={<RiskManagement />} />
            <Route path="/ai"         element={<AiAssistant />} />
            <Route path="/reports"    element={<Reports />} />
            <Route path="/settings"   element={<Settings />} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
