// ============================================================
// Enterprise Azure Sidebar — Collapsible, Fluent 2 style
// ============================================================

import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Server, Activity, AlertTriangle, Zap,
  Brain, FileBarChart, Settings, ChevronLeft, ChevronRight,
  LogOut, Cloud, ShieldAlert, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../providers/AuthProvider';
import { useAppStore } from '../../store/appStore';

const navItems = [
  { id: 'dashboard',   label: 'Overview',      icon: LayoutDashboard, path: '/' },
  { id: 'resources',   label: 'Resources',      icon: Server,          path: '/resources' },
  { id: 'monitoring',  label: 'Monitoring',     icon: Activity,        path: '/monitoring' },
  { id: 'actions',     label: 'Actions',        icon: Zap,             path: '/actions' },
  { id: 'incidents',   label: 'Incidents',      icon: AlertTriangle,   path: '/incidents' },
];

const governanceItems = [
  { id: 'security',  label: 'Security',    icon: ShieldAlert,  path: '/security' },
  { id: 'risk',      label: 'Risk Management', icon: ShieldCheck,  path: '/risk' },
  { id: 'ai',        label: 'AI Assistant',icon: Brain,        path: '/ai' },
  { id: 'reports',   label: 'Reports',     icon: FileBarChart, path: '/reports' },
  { id: 'settings',  label: 'Settings',    icon: Settings,     path: '/settings' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { sidebarCollapsed, toggleSidebar, incidents, subscriptions, activeSubscriptionId } = useAppStore();
  const location = useLocation();

  const openIncidents = incidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length;
  const initials = user?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
  const activeSub = subscriptions.find(s => s.id === activeSubscriptionId);

  return (
    <aside className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <span className="b1" /><span className="b2" />
          <span className="b3" /><span className="b4" />
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">Azure CloudOps</span>
          <span className="sidebar-brand-sub">Enterprise Portal</span>
        </div>
      </div>

      {/* Active Subscription Chip */}
      {!sidebarCollapsed && activeSub && (
        <div style={{ padding: '0 8px 8px' }}>
          <div className="subscription-selector">
            <Cloud size={12} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeSub.name || activeSub.displayName || 'Subscription'}
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-title">Operations</div>
        {navItems.map(item => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-item${isActive || (item.path === '/' && location.pathname === '/') ? ' active' : ''}`
            }
            end={item.path === '/'}
            title={sidebarCollapsed ? item.label : undefined}
          >
            <span className="sidebar-item-icon">
              <item.icon size={17} strokeWidth={1.8} />
            </span>
            <span className="sidebar-item-label">{item.label}</span>
            {item.id === 'incidents' && openIncidents > 0 && (
              <span className="sidebar-item-badge">{openIncidents}</span>
            )}
          </NavLink>
        ))}

        <div className="sidebar-section-title">Governance</div>
        {governanceItems.map(item => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
            title={sidebarCollapsed ? item.label : undefined}
          >
            <span className="sidebar-item-icon">
              <item.icon size={17} strokeWidth={1.8} />
            </span>
            <span className="sidebar-item-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        className="sidebar-collapse-btn"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed
          ? <ChevronRight size={16} />
          : <><ChevronLeft size={16} /><span>Collapse</span></>
        }
      </button>

      {/* User Footer */}
      <div className="sidebar-footer">
        <div
          className="sidebar-user"
          onClick={logout}
          title="Sign out"
          role="button"
          aria-label="Sign out"
        >
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.displayName || 'User'}</div>
            <div className="sidebar-user-role">{user?.role || 'Viewer'}</div>
          </div>
          <LogOut size={14} style={{ color: 'var(--sidebar-text-muted)', minWidth: 14 }} />
        </div>
      </div>
    </aside>
  );
}
