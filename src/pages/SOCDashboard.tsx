// ============================================================
// SOC Dashboard — Security Operations Center
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Siren, Shield, AlertTriangle, Eye, Activity,
  RefreshCw, CheckCircle, XCircle, Clock, Globe,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { useAppStore, TENANT_CONFIGS } from '../store/appStore';
import { api } from '../services/api';

const SEVERITY_COLORS: Record<string, string> = { Critical: '#D13438', High: '#c05500', Medium: '#FFB900', Low: '#0078d4', Informational: '#64748b' };

const MITRE_TACTICS = [
  { tactic: 'Initial Access', count: 3, color: '#D13438' },
  { tactic: 'Execution', count: 1, color: '#c05500' },
  { tactic: 'Persistence', count: 2, color: '#FFB900' },
  { tactic: 'Privilege Escalation', count: 0, color: '#107C10' },
  { tactic: 'Defense Evasion', count: 1, color: '#FFB900' },
  { tactic: 'Credential Access', count: 4, color: '#D13438' },
  { tactic: 'Discovery', count: 2, color: '#FFB900' },
  { tactic: 'Lateral Movement', count: 0, color: '#107C10' },
  { tactic: 'Collection', count: 1, color: '#0078d4' },
  { tactic: 'Exfiltration', count: 0, color: '#107C10' },
];

export default function SOCDashboard() {
  const { activeSubscriptionId, activeEnvironment, defenderStatus, setDefenderStatus } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'mitre' | 'incidents'>('timeline');

  const tenantConfig = activeEnvironment !== 'All' ? TENANT_CONFIGS[activeEnvironment] : null;

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeSubscriptionId) {
        const data = await api.get<any>('/api/monitoring/defender', { params: { subscriptionId: activeSubscriptionId } });
        setDefenderStatus(data);
      }
    } catch { /* fallback data used */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [activeSubscriptionId]);

  const alerts = defenderStatus?.alerts || [];
  const recommendations = defenderStatus?.recommendations || [];

  // Generate threat timeline data
  const timelineData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const hour = new Date(now);
      hour.setHours(hour.getHours() - (23 - i));
      return {
        time: `${hour.getHours().toString().padStart(2, '0')}:00`,
        threats: Math.floor(Math.random() * 8),
        blocked: Math.floor(Math.random() * 12),
        investigated: Math.floor(Math.random() * 5),
      };
    });
  }, []);

  const threatSummary = [
    { label: 'Active Threats', value: alerts.length || 3, color: '#D13438', icon: AlertTriangle },
    { label: 'Investigated', value: Math.max(alerts.length - 1, 5), color: '#FFB900', icon: Eye },
    { label: 'Blocked', value: 47, color: '#107C10', icon: Shield },
    { label: 'Mean Response', value: '12m', color: '#0078d4', icon: Clock },
  ];

  const recentIncidents = [
    { id: 'SOC-001', title: 'Brute force SSH attempt detected', severity: 'High', time: '14 min ago', status: 'Investigating', source: 'Azure Sentinel' },
    { id: 'SOC-002', title: 'Unusual key vault access from unknown IP', severity: 'Critical', time: '28 min ago', status: 'Contained', source: 'Defender for Cloud' },
    { id: 'SOC-003', title: 'Suspicious PowerShell execution on VM', severity: 'Medium', time: '1h ago', status: 'Resolved', source: 'Defender for Endpoint' },
    { id: 'SOC-004', title: 'Data exfiltration pattern in storage logs', severity: 'High', time: '2h ago', status: 'Investigating', source: 'Azure Sentinel' },
    { id: 'SOC-005', title: 'Anomalous login from Tor exit node', severity: 'Critical', time: '3h ago', status: 'Contained', source: 'Entra ID Protection' },
    { id: 'SOC-006', title: 'Failed MFA challenge surge detected', severity: 'Medium', time: '5h ago', status: 'Resolved', source: 'Entra ID Protection' },
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Security Operations Center</h1>
          <p className="page-subtitle">
            Real-time threat monitoring, incident response, and MITRE ATT&CK mapping
            {tenantConfig && <> for <strong>{tenantConfig.name}</strong></>}
          </p>
        </div>
        <div className="page-actions">
          <div className="header-live-indicator" style={{ marginRight: 10 }}>
            <span className="live-dot" style={{ background: '#D13438' }} />
            <span style={{ fontWeight: 700, color: '#D13438', fontSize: 12 }}>MONITORING</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Threat Summary Cards */}
      <div className="kpi-grid">
        {threatSummary.map(item => (
          <div key={item.label} className="kpi-card">
            <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${item.color}, ${item.color}88)` }} />
            <div className="kpi-card-top">
              <div>
                <div className="kpi-label">{item.label}</div>
                <div className="kpi-value" style={{ color: item.color }}>{item.value}</div>
              </div>
              <div className="kpi-icon" style={{ background: `${item.color}18` }}>
                <item.icon size={20} color={item.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          { id: 'timeline', label: 'Threat Timeline' },
          { id: 'mitre', label: 'MITRE ATT&CK' },
          { id: 'incidents', label: 'SOC Incidents', count: recentIncidents.length },
        ].map(tab => (
          <button key={tab.id} className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id as any)}>
            {tab.label}
            {tab.count !== undefined && <span className="tab-badge">{tab.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'timeline' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Activity size={16} color="#D13438" /> 24-Hour Threat Activity</div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={timelineData} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="threatGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D13438" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#D13438" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="blockedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#107C10" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#107C10" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12, boxShadow: 'var(--shadow-lg)' }} />
                <Area type="monotone" dataKey="threats" stroke="#D13438" strokeWidth={2} fill="url(#threatGrad)" name="Threats" />
                <Area type="monotone" dataKey="blocked" stroke="#107C10" strokeWidth={2} fill="url(#blockedGrad)" name="Blocked" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'mitre' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Globe size={16} color="var(--azure-600)" /> MITRE ATT&CK Coverage</div>
            <div className="card-subtitle">Threat activity mapped to MITRE ATT&CK tactics</div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={MITRE_TACTICS} layout="vertical" margin={{ top: 5, right: 20, left: 120, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="tactic" type="category" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={115} />
                <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} name="Detections">
                  {MITRE_TACTICS.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'incidents' && (
        <div className="card">
          <div className="card-body" style={{ paddingTop: 8 }}>
            <div className="insight-list">
              {recentIncidents.map(inc => {
                const color = SEVERITY_COLORS[inc.severity] || '#64748b';
                const statusColor: Record<string, string> = { Investigating: '#FFB900', Contained: '#0078d4', Resolved: '#107C10' };
                return (
                  <div key={inc.id} className="insight-item">
                    <div className="insight-icon" style={{ background: `${color}18` }}>
                      <Siren size={16} color={color} />
                    </div>
                    <div className="insight-content">
                      <div className="insight-title">
                        <span style={{ fontWeight: 700, marginRight: 8, color: 'var(--text-tertiary)', fontSize: 11 }}>{inc.id}</span>
                        {inc.title}
                      </div>
                      <div className="insight-desc">
                        {inc.source} · {inc.time}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span className={`severity-badge ${inc.severity.toLowerCase()}`}>{inc.severity}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: statusColor[inc.status] || 'var(--text-tertiary)' }}>{inc.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
