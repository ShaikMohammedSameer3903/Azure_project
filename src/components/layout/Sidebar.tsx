// ============================================================
// Enterprise Azure Sidebar — Multi-Tenant, Collapsible, Fluent 2
// ============================================================

import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Server, Activity, AlertTriangle, Zap,
  Brain, FileBarChart, Settings, ChevronLeft, ChevronRight,
  LogOut, Cloud, ShieldAlert, ShieldCheck, BarChart3,
  HardDrive, Landmark, PieChart, Siren, Globe,
} from 'lucide-react';
import { useAuth } from '../../providers/AuthProvider';
import { useAppStore, TENANT_CONFIGS, type IndustryTenant } from '../../store/appStore';

const operationsItems = [
  { id: 'dashboard',    label: 'Executive View',   icon: LayoutDashboard, path: '/' },
  { id: 'resources',    label: 'Resources',         icon: Server,          path: '/resources' },
  { id: 'monitoring',   label: 'Monitoring',        icon: Activity,        path: '/monitoring' },
  { id: 'cost',         label: 'Cost Management',   icon: PieChart,        path: '/cost' },
  { id: 'incidents',    label: 'Incidents',          icon: AlertTriangle,   path: '/incidents' },
  { id: 'actions',      label: 'Actions',            icon: Zap,             path: '/actions' },
];

const securityItems = [
  { id: 'security',     label: 'Security Center',   icon: ShieldAlert,     path: '/security' },
  { id: 'soc',          label: 'SOC Dashboard',      icon: Siren,           path: '/soc' },
  { id: 'risk',         label: 'Risk Management',    icon: ShieldCheck,     path: '/risk' },
  { id: 'governance',   label: 'Governance',          icon: Landmark,        path: '/governance' },
];

const analyticsItems = [
  { id: 'backup',       label: 'Backup & DR',        icon: HardDrive,       path: '/backup' },
  { id: 'ai',           label: 'AI Assistant',        icon: Brain,           path: '/ai' },
  { id: 'reports',      label: 'Reports',             icon: FileBarChart,    path: '/reports' },
  { id: 'settings',     label: 'Settings',            icon: Settings,        path: '/settings' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { sidebarCollapsed, toggleSidebar, incidents, subscriptions, activeSubscriptionId, activeEnvironment } = useAppStore();
  const location = useLocation();

  const openIncidents = incidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length;
  const initials = user?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
  const activeSub = subscriptions.find(s => s.id === activeSubscriptionId);

  const tenantConfig = activeEnvironment !== 'All' ? TENANT_CONFIGS[activeEnvironment] : null;

  const renderNavGroup = (title: string, items: typeof operationsItems) => (
    <>
      <div className="sidebar-section-title">{title}</div>
      {items.map(item => (
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
    </>
  );

  return (
    <aside className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon" style={tenantConfig ? { background: tenantConfig.gradient } : undefined}>
          {tenantConfig ? (
            <span style={{ fontSize: 16, lineHeight: 1 }}>{tenantConfig.icon}</span>
          ) : (
            <>
              <span className="b1" /><span className="b2" />
              <span className="b3" /><span className="b4" />
            </>
          )}
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">
            {tenantConfig ? tenantConfig.name : 'Azure CloudOps'}
          </span>
          <span className="sidebar-brand-sub">
            {tenantConfig ? tenantConfig.industry + ' Tenant' : 'Enterprise Portal'}
          </span>
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

      {/* Tenant Compliance Badge */}
      {!sidebarCollapsed && tenantConfig && (
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 4,
          }}>
            {tenantConfig.complianceFrameworks.map(fw => (
              <span
                key={fw}
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: `${tenantConfig.color}22`,
                  color: tenantConfig.color,
                  letterSpacing: '0.04em',
                }}
              >
                {fw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="sidebar-nav">
        {renderNavGroup('Operations', operationsItems)}
        {renderNavGroup('Security & Compliance', securityItems)}
        {renderNavGroup('Analytics & Admin', analyticsItems)}
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
