// ============================================================
// Enterprise Header — Azure Portal style top bar
// ============================================================

import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, Sun, Moon, RefreshCw, Menu, ChevronDown } from 'lucide-react';
import { useTheme } from '../../providers/ThemeProvider';
import { useAppStore } from '../../store/appStore';
import { useEffect, useCallback, useState, useRef } from 'react';

const pageTitles: Record<string, string> = {
  '/':          'Overview',
  '/resources': 'Resources',
  '/monitoring':'Monitoring',
  '/actions':   'Actions',
  '/incidents': 'Incidents',
  '/ai':        'AI Assistant',
  '/reports':   'Reports',
  '/security':  'Security Center',
  '/settings':  'Settings',
};

export default function Header() {
  const { toggleTheme, isDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    isRefreshing, lastUpdated, unreadCount,
    globalSearchQuery, setGlobalSearchQuery,
    toggleSidebar,
    subscriptions, activeSubscriptionId, setActiveSubscription,
    autoRefreshEnabled, refreshInterval,
  } = useAppStore();

  const [showSubDropdown, setShowSubDropdown] = useState(false);
  const [countdown, setCountdown] = useState(refreshInterval);
  const countdownRef = useRef<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentPage = pageTitles[location.pathname] || 'Dashboard';
  const activeSub = subscriptions.find(s => s.id === activeSubscriptionId);

  // Countdown timer for auto-refresh
  useEffect(() => {
    if (!autoRefreshEnabled) return;
    setCountdown(refreshInterval);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return refreshInterval;
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [autoRefreshEnabled, refreshInterval, lastUpdated]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSubDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleRefresh = useCallback(async () => {
    // Let the useAzureData hook handle this via event trigger
    window.dispatchEvent(new CustomEvent('azure-manual-refresh'));
  }, []);

  const formatLastUpdated = () => {
    if (!lastUpdated) return 'Never';
    const diff = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000);
    if (diff < 60)  return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <header className="header">
      {/* Left: Menu + Breadcrumb */}
      <div className="header-left">
        <button
          className="header-toggle-btn"
          onClick={toggleSidebar}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          <Menu size={17} />
        </button>

        <div className="header-breadcrumbs">
          <a onClick={() => navigate('/')} role="link" tabIndex={0}>Home</a>
          <span className="separator">›</span>
          <span className="current">{currentPage}</span>
        </div>
      </div>

      {/* Center: Search */}
      <div className="header-center">
        <div className="header-search-wrapper">
          <Search size={13} className="header-search-icon" />
          <input
            type="text"
            className="header-search"
            placeholder="Search resources, alerts, subscriptions…"
            value={globalSearchQuery}
            onChange={e => setGlobalSearchQuery(e.target.value)}
            aria-label="Global search"
          />
          <div className="header-search-kbd">
            <span className="kbd">Ctrl</span>
            <span className="kbd">K</span>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="header-right">
        {/* Live indicator */}
        <div className="header-live-indicator" title={`Last refreshed: ${formatLastUpdated()}`}>
          <span className="live-dot" />
          <span>Live</span>
        </div>

        {/* Environment Selector Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Sector:</span>
          <select
            style={{
              padding: '5px 8px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-secondary)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
            value={useAppStore(s => s.activeEnvironment)}
            onChange={e => useAppStore.getState().setActiveEnvironment(e.target.value as any)}
            aria-label="Select industry environment"
          >
            <option value="All">All Sectors</option>
            <option value="Healthcare">Healthcare</option>
            <option value="University">University</option>
          </select>
        </div>

        {/* Subscription selector */}
        {subscriptions.length > 1 && (
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface-secondary)',
                color: 'var(--text-primary)',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              onClick={() => setShowSubDropdown(v => !v)}
              title="Select subscription"
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                {activeSub?.name || activeSub?.displayName || 'Select Sub'}
              </span>
              <ChevronDown size={12} style={{ flexShrink: 0 }} />
            </button>
            {showSubDropdown && (
              <div className="dropdown-menu" style={{ minWidth: 220, left: 0, right: 'auto' }}>
                {subscriptions.map(sub => (
                  <div
                    key={sub.id}
                    className="dropdown-item"
                    onClick={() => { setActiveSubscription(sub.id); setShowSubDropdown(false); }}
                    style={{ fontWeight: sub.id === activeSubscriptionId ? 700 : 400 }}
                  >
                    {sub.name || sub.displayName}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="header-divider" />

        {/* Auto-refresh countdown */}
        {autoRefreshEnabled && (
          <span
            className="header-refresh-countdown"
            title="Auto-refresh countdown"
          >
            {countdown}s
          </span>
        )}

        {/* Manual refresh */}
        <button
          className="header-icon-btn"
          onClick={handleRefresh}
          title={`Refresh data (last: ${formatLastUpdated()})`}
          aria-label="Refresh data"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        </button>

        {/* Theme toggle */}
        <button
          className="header-icon-btn"
          onClick={toggleTheme}
          title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Notifications */}
        <button
          className="header-icon-btn"
          title={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
          aria-label="Notifications"
        >
          <Bell size={16} />
          {unreadCount > 0 && <span className="badge-dot" />}
        </button>
      </div>
    </header>
  );
}
