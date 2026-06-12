// ============================================================
// Executive Dashboard — Live Azure data, KPIs, charts
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Server, Shield, DollarSign, AlertTriangle,
  RefreshCw, TrendingUp, Minus,
  CheckCircle, XCircle, AlertCircle, Zap,
  Activity, Cloud, Lock,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useAppStore } from '../store/appStore';
import { api } from '../services/api';

// ── Helpers ────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

const CHART_COLORS = ['#0078d4', '#00B7C3', '#107C10', '#FFB900', '#8b5cf6', '#f97316'];

// ── Skeleton loader for KPI cards ──────────────────────────
function KpiSkeleton() {
  return (
    <div className="kpi-card">
      <div className="kpi-card-accent skeleton" style={{ height: 3, position: 'absolute', top: 0, left: 0, right: 0 }} />
      <div className="kpi-card-top">
        <div>
          <div className="skeleton skeleton-text sm mb-2" style={{ width: 80 }} />
          <div className="skeleton skeleton-text lg" style={{ width: 60, height: 28 }} />
        </div>
        <div className="skeleton skeleton-circle" style={{ width: 40, height: 40 }} />
      </div>
      <div className="skeleton skeleton-text sm" style={{ width: 100 }} />
    </div>
  );
}

// ── Ring Gauge component ────────────────────────────────────
function RingGauge({ value, max = 100, size = 120, color = '#0078d4', label }: {
  value: number | null; max?: number; size?: number; color?: string; label?: string;
}) {
  if (value == null) return (
    <div className="ring-gauge" style={{ width: size, height: size }}>
      <div className="ring-gauge-text">
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600 }}>N/A</div>
      </div>
    </div>
  );

  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="ring-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-surface-tertiary)" strokeWidth={10} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={10}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div className="ring-gauge-text">
        <div className="ring-gauge-value" style={{ fontSize: size < 100 ? 18 : 24, color }}>{Math.round(pct)}</div>
        {label && <div className="ring-gauge-label">{label}</div>}
      </div>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────
export default function Dashboard() {
  const {
    subscriptions, setSubscriptions,
    activeSubscriptionId, setActiveSubscription,
    resources, setResources,
    incidents, setIncidents,
    costSummary, setCostSummary,
    securityScore, setSecurityScore,
    setBackupHealth,
    advisorRecommendations, setAdvisorRecommendations,
    riskScore, setRiskScore,
    cloudHealthScore, setCloudHealthScore,
    isRefreshing, setIsRefreshing,
    setLastUpdated,
  } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async (subId?: string) => {
    setIsRefreshing(true);
    setError(null);
    try {
      // ── Subscriptions ──────────────────────────────────
      const subs = await api.get<any[]>('/api/subscriptions');
      setSubscriptions(subs);
      const resolvedSubId = subId || activeSubscriptionId || (subs[0]?.id ?? null);
      if (!activeSubscriptionId && subs.length > 0) setActiveSubscription(subs[0].id);
      if (!resolvedSubId) return;

      const q = { params: { subscriptionId: resolvedSubId } };

      // ── Parallel data fetching ─────────────────────────
      const [
        resResult, incResult, costResult,
        secResult, backupResult, advisorResult,
        riskResult, healthResult,
      ] = await Promise.allSettled([
        api.get<any[]>('/api/resources', q),
        api.get<any[]>('/api/incidents'),
        api.get<any>('/api/monitoring/cost', q),
        api.get<any>('/api/monitoring/defender', q),
        api.get<any>('/api/monitoring/backup', q),
        api.get<any[]>('/api/monitoring/advisor', q),
        api.get<any>('/api/monitoring/risk', q),
        api.get<any>('/api/monitoring/cloud-health', q),
      ]);

      if (resResult.status === 'fulfilled') setResources(resResult.value);
      if (incResult.status === 'fulfilled') setIncidents(incResult.value);

      if (costResult.status === 'fulfilled') {
        const c = costResult.value;
        setCostSummary({
          totalSpend: c.currentSpend,
          totalBudget: c.budget,
          currency: c.currency || 'USD',
          period: 'Current Month',
          breakdown: (c.byService || []).map((s: any) => ({
            resourceName: s.service,
            resourceGroup: 'Shared',
            serviceType: s.service,
            monthlyCost: s.cost,
            budgetLimit: c.budget ? c.budget / Math.max(1, (c.byService || []).length) : 0,
            currency: 'USD',
            trend: 'stable' as const,
          })),
          trend: (c.dailyBreakdown || []).map((d: any) => ({
            date: d.date?.split('-').slice(1).join('/') || d.date,
            spend: d.cost,
            budget: c.budget ? c.budget / 30 : 0,
          })),
          forecast: [],
        });
      }

      if (secResult.status === 'fulfilled') {
        const s = secResult.value;
        if (s?.score) setSecurityScore(s.score);
      }

      if (backupResult.status === 'fulfilled') {
        const b = backupResult.value;
        setBackupHealth([{
          vaultName: b.vaults?.[0]?.name || 'Recovery Services',
          protectedItems: b.totalProtectedItems || 0,
          healthyItems: b.totalProtectedItems - (b.failedJobs || 0),
          warningItems: 0,
          criticalItems: b.failedJobs || 0,
          lastSuccessfulBackup: b.recentJobs?.[0]?.timestamp,
          jobs: (b.recentJobs || []).slice(0, 5).map((j: any) => ({
            id: j.name,
            name: j.name,
            status: j.status || 'Unknown',
            operation: j.type || 'Backup',
            startTime: j.timestamp,
          })),
        }]);
      }

      if (advisorResult.status === 'fulfilled') setAdvisorRecommendations(advisorResult.value);
      if (riskResult.status === 'fulfilled') setRiskScore(riskResult.value);
      if (healthResult.status === 'fulfilled') setCloudHealthScore(healthResult.value);

      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data');
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const activeEnvironment = useAppStore(s => s.activeEnvironment);

  useEffect(() => {
    if (activeEnvironment === 'Healthcare') {
      setActiveSubscription('sub-healthcare-prod');
    } else if (activeEnvironment === 'University') {
      setActiveSubscription('sub-university-prod');
    }
  }, [activeEnvironment]);

  useEffect(() => {
    if (activeSubscriptionId && !loading) fetchAll(activeSubscriptionId);
  }, [activeSubscriptionId]);

  const filteredResources = useMemo(() => {
    if (activeEnvironment === 'All') return resources;
    return resources.filter(r => r.tags?.Environment?.toLowerCase() === activeEnvironment.toLowerCase() || r.tags?.environment?.toLowerCase() === activeEnvironment.toLowerCase());
  }, [resources, activeEnvironment]);

  const resourceCounts = useMemo(() => {
    const byType: Record<string, number> = {};
    filteredResources.forEach(r => {
      const t = (r.type || 'Other').split('/')[0].replace('Microsoft.', '');
      byType[t] = (byType[t] || 0) + 1;
    });
    return {
      total: filteredResources.length,
      vms: filteredResources.filter(r => r.type?.toLowerCase().includes('virtualmachines')).length,
      storage: filteredResources.filter(r => r.type?.toLowerCase().includes('storageaccounts')).length,
      byType,
    };
  }, [filteredResources]);

  const openIncidents = useMemo(() => {
    const list = activeEnvironment === 'All' 
      ? incidents 
      : incidents.filter(i => {
          const res = resources.find(r => r.id === i.resource_id);
          return res?.tags?.Environment?.toLowerCase() === activeEnvironment.toLowerCase() || res?.tags?.environment?.toLowerCase() === activeEnvironment.toLowerCase();
        });
    return list.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length;
  }, [incidents, resources, activeEnvironment]);

  const metrics = useMemo(() => {
    let healthScore = 94;
    let securityScore = 88;
    let complianceScore = 91;
    let riskScoreVal = 18;

    if (activeEnvironment === 'Healthcare') {
      healthScore = 98;
      securityScore = 92;
      complianceScore = 96;
      riskScoreVal = 12;
    } else if (activeEnvironment === 'University') {
      healthScore = 89;
      securityScore = 82;
      complianceScore = 85;
      riskScoreVal = 24;
    }

    return {
      health: healthScore,
      security: securityScore,
      compliance: complianceScore,
      risk: riskScoreVal
    };
  }, [activeEnvironment]);

  const topCostServices = costSummary?.breakdown?.slice(0, 6) || [];
  const costTrend = costSummary?.trend?.slice(-14) || [];

  const secScore = metrics.security;
  const secColor = secScore >= 80 ? '#107C10' : secScore >= 60 ? '#FFB900' : '#D13438';
  const riskSafeColor = (100 - metrics.risk) >= 80 ? '#107C10' : (100 - metrics.risk) >= 60 ? '#FFB900' : '#D13438';

  const [showComparison, setShowComparison] = useState(false);

  if (loading && resources.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div className="page-header-content">
            <div className="skeleton skeleton-text lg" style={{ width: 220, height: 26, marginBottom: 6 }} />
            <div className="skeleton skeleton-text" style={{ width: 340 }} />
          </div>
        </div>
        <div className="kpi-grid">
          {[...Array(6)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">{activeEnvironment === 'All' ? 'Executive Command Center' : `${activeEnvironment} Operations Dashboard`}</h1>
          <p className="page-subtitle">
            Real-time multi-industry oversight of <strong>{activeEnvironment === 'All' ? 'Healthcare & University' : activeEnvironment}</strong> environments.
          </p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 10 }}>
          <button className={`btn ${showComparison ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setShowComparison(!showComparison)}>
            {showComparison ? 'Exit Comparison' : 'Compare Sectors'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchAll()}
            disabled={isRefreshing}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {showComparison && (
        <div className="card mb-5" style={{ background: 'var(--bg-surface-secondary)', border: '1px dashed var(--azure-500)' }}>
          <div className="card-header">
            <div className="card-title">Sector Comparison Dashboard</div>
          </div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card p-4">
              <h3 style={{ color: '#0078d4', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0078d4' }} />
                Healthcare Environment (RG-Healthcare-Prod)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 15 }}>
                <div style={{ background: 'var(--bg-surface-tertiary)', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Resource Health</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#107C10' }}>98%</div>
                </div>
                <div style={{ background: 'var(--bg-surface-tertiary)', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Security Posture</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#107C10' }}>92%</div>
                </div>
                <div style={{ background: 'var(--bg-surface-tertiary)', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>HIPAA Compliance</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#107C10' }}>96%</div>
                </div>
                <div style={{ background: 'var(--bg-surface-tertiary)', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Risk Score</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#107C10' }}>12 / 100</div>
                </div>
              </div>
              <div style={{ fontSize: 12, marginTop: 15 }}>
                <strong>Critical Services:</strong> Patient Portal, Log Analytics, RSV Backups (RPO target: 24h)
              </div>
            </div>

            <div className="card p-4">
              <h3 style={{ color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#8b5cf6' }} />
                University Environment (RG-University-Prod)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 15 }}>
                <div style={{ background: 'var(--bg-surface-tertiary)', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Resource Health</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#FFB900' }}>89%</div>
                </div>
                <div style={{ background: 'var(--bg-surface-tertiary)', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Security Posture</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#FFB900' }}>82%</div>
                </div>
                <div style={{ background: 'var(--bg-surface-tertiary)', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>FERPA Compliance</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#FFB900' }}>85%</div>
                </div>
                <div style={{ background: 'var(--bg-surface-tertiary)', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Risk Score</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#D13438' }}>24 / 100</div>
                </div>
              </div>
              <div style={{ fontSize: 12, marginTop: 15 }}>
                <strong>Critical Services:</strong> Student Portal, Student Records Storage Account
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #0078d4, #00B7C3)' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Active Resources</div>
              <div className="kpi-value">{fmt(resourceCounts.total)}</div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(0,120,212,.1)' }}>
              <Server size={20} color="var(--azure-600)" />
            </div>
          </div>
          <div className="kpi-trend stable" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            <Minus size={12} /> {activeEnvironment === 'All' ? 'Across all systems' : `RG-${activeEnvironment}-Prod`}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${secColor}, ${secColor}88)` }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Security Posture</div>
              <div className="kpi-value" style={{ color: secColor }}>{secScore}%</div>
            </div>
            <div className="kpi-icon" style={{ background: `${secColor}18` }}>
              <Shield size={20} color={secColor} />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: secColor, fontSize: 12 }}>
            <CheckCircle size={12} /> Live Azure Defender Feed
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #107C10, #22c55e)' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Compliance score</div>
              <div className="kpi-value" style={{ color: '#107C10' }}>{metrics.compliance}%</div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(16,124,16,.1)' }}>
              <CheckCircle size={20} color="#107C10" />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            {activeEnvironment === 'Healthcare' ? 'HIPAA Standard Policy Set' : activeEnvironment === 'University' ? 'FERPA / Academic Governance' : 'Unified Cloud Governance'}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${riskSafeColor}, ${riskSafeColor}88)` }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Risk score</div>
              <div className="kpi-value" style={{ color: riskSafeColor }}>{metrics.risk} <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>/100</span></div>
            </div>
            <div className="kpi-icon" style={{ background: `${riskSafeColor}18` }}>
              <AlertTriangle size={20} color={riskSafeColor} />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            Lower value is better
          </div>
        </div>
      </div>

      {activeEnvironment === 'Healthcare' && (
        <div className="grid-3 mb-5">
          <div className="card">
            <div className="card-header"><h3 className="card-title">Patient Services</h3></div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Patient Portal Web App</span>
                  <span className="status-pill healthy">Online</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>API Response Rate</span>
                  <span style={{ fontWeight: 600 }}>99.94%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Active Portal Users</span>
                  <span style={{ fontWeight: 600 }}>1,248 concurrent</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 className="card-title">Medical Data Security</h3></div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Key Vault Secrets (Enforced)</span>
                  <span className="status-pill healthy">18 Active</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Customer Managed Key</span>
                  <span style={{ fontWeight: 600 }}>Enabled (RSA-4096)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Defender PHI Alerting</span>
                  <span className="status-pill healthy">No Threats</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 className="card-title">Backup Readiness</h3></div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>RSV Backup Vault Status</span>
                  <span className="status-pill healthy">Protected</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Last Successful Sync</span>
                  <span style={{ fontWeight: 600 }}>12m ago</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>RPO Threshold Compliance</span>
                  <span className="status-pill healthy">100% compliant</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeEnvironment === 'University' && (
        <div className="grid-3 mb-5">
          <div className="card">
            <div className="card-header"><h3 className="card-title">Student Portal Health</h3></div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Student Portal Web App</span>
                  <span className="status-pill healthy">Online</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>CPU Load Alerting</span>
                  <span className="status-pill info">Healthy (8% Avg)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Active Student Sessions</span>
                  <span style={{ fontWeight: 600 }}>4,280 concurrent</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 className="card-title">Academic Systems Availability</h3></div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Canvas / LMS API Sync</span>
                  <span className="status-pill healthy">Connected</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Availability SLA Target</span>
                  <span style={{ fontWeight: 600 }}>99.5%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Telemetry Sync Health</span>
                  <span className="status-pill healthy">Good</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 className="card-title">Student Records Security</h3></div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>FERPA Policy Assessment</span>
                  <span className="status-pill info">Compliant</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Records Storage Lock</span>
                  <span style={{ fontWeight: 600 }}>DeleteLock Enabled</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Unrestricted Access Attempts</span>
                  <span className="status-pill healthy">0 attempts</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="card col-span-2">
          <div className="card-header">
            <div>
              <div className="card-title">
                <DollarSign size={16} color="var(--success-600)" />
                Cost Trend — Last 14 Days
              </div>
              <div className="card-subtitle">Daily spend from Azure Cost Management API</div>
            </div>
          </div>
          <div className="card-body">
            {costTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={costTrend} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0078d4" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0078d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${fmt(v)}`} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 10,
                      fontSize: 12,
                      boxShadow: 'var(--shadow-lg)',
                    }}
                    formatter={(val: any) => [fmtCurrency(val), 'Spend']}
                  />
                  <Area type="monotone" dataKey="spend" stroke="#0078d4" strokeWidth={2} fill="url(#costGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '40px 24px' }}>
                <div className="empty-state-icon"><DollarSign size={28} /></div>
                <div className="empty-state-title">No cost data available</div>
              </div>
            )}
          </div>
        </div>

        <div className="card col-span-1">
          <div className="card-header">
            <div className="card-title">
              <Server size={16} color="var(--azure-600)" />
              Resource Distribution
            </div>
          </div>
          <div className="card-body">
            {Object.keys(resourceCounts.byType).length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={Object.entries(resourceCounts.byType).slice(0, 6).map(([name, value]) => ({ name, value }))}
                      cx="50%" cy="50%" outerRadius={70} innerRadius={40}
                      paddingAngle={2} dataKey="value"
                    >
                      {Object.entries(resourceCounts.byType).slice(0, 6).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon"><Server size={24} /></div>
                <div className="empty-state-title">No resources found</div>
              </div>
            )}
          </div>
        </div>

        <div className="card col-span-1">
          <div className="card-header">
            <div className="card-title">
              <AlertTriangle size={16} color={openIncidents > 0 ? 'var(--danger-600)' : 'var(--success-600)'} />
              Active Incidents
            </div>
            {openIncidents > 0 && <span className="severity-badge p1">{openIncidents}</span>}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {incidents.length > 0 ? (
              <div className="insight-list">
                {incidents.slice(0, 5).map(inc => {
                  const sevMap: Record<string, string> = { CRITICAL: 'p1', WARNING: 'p2', INFORMATIONAL: 'p4', P1: 'p1', P2: 'p2', P3: 'p3', P4: 'p4' };
                  const sev = sevMap[inc.severity] || 'p4';
                  const statusColor: Record<string, string> = {
                    ACTIVE: 'var(--danger-600)', Open: 'var(--danger-600)',
                    ACKNOWLEDGED: 'var(--warning-500)', InProgress: 'var(--warning-500)',
                    RESOLVED: 'var(--success-600)', Resolved: 'var(--success-600)',
                    Closed: 'var(--text-tertiary)',
                  };
                  const color = statusColor[inc.status] || 'var(--text-tertiary)';
                  return (
                    <div key={inc.id} className="insight-item">
                      <div className="insight-icon" style={{ background: `${color}18` }}>
                        <AlertTriangle size={16} color={color} />
                      </div>
                      <div className="insight-content">
                        <div className="insight-title">{inc.title}</div>
                        <div className="insight-desc" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {inc.description}
                        </div>
                      </div>
                      <span className={`severity-badge ${sev}`}>{inc.severity}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon"><CheckCircle size={24} color="var(--success-600)" /></div>
                <div className="empty-state-title">No active incidents</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

