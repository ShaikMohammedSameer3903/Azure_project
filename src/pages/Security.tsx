// ============================================================
// Security Center — Defender + Risk + Sentinel
// ============================================================

import { useEffect, useState } from 'react';
import {
  Shield, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, Lock, AlertCircle,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { api } from '../services/api';

function GaugeMeter({ value, color, size = 110 }: { value: number | null; color: string; size?: number }) {
  if (value == null) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>N/A</div>;
  const pct = Math.min(100, Math.max(0, value));
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-surface-tertiary)" strokeWidth={10} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 800ms ease' }} />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{Math.round(pct)}</div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>/ 100</div>
      </div>
    </div>
  );
}

export default function Security() {
  const {
    activeSubscriptionId,
    securityScore, setSecurityScore,
    defenderStatus, setDefenderStatus,
    riskScore, setRiskScore,
    advisorRecommendations, setAdvisorRecommendations,
  } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'recommendations' | 'alerts' | 'risk'>('overview');

  const fetchData = async () => {
    if (!activeSubscriptionId) return;
    setLoading(true);
    const q = { params: { subscriptionId: activeSubscriptionId } };
    try {
      const [defRes, riskRes, advisorRes] = await Promise.allSettled([
        api.get<any>('/api/monitoring/defender', q),
        api.get<any>('/api/monitoring/risk', q),
        api.get<any[]>('/api/monitoring/advisor', q),
      ]);
      if (defRes.status === 'fulfilled') {
        setDefenderStatus(defRes.value);
        if (defRes.value?.score) setSecurityScore(defRes.value.score);
      }
      if (riskRes.status === 'fulfilled') setRiskScore(riskRes.value);
      if (advisorRes.status === 'fulfilled') setAdvisorRecommendations(advisorRes.value);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeSubscriptionId]);

  const secPct = securityScore?.percentage ?? null;
  const secColor = secPct == null ? '#94a3b8' : secPct >= 80 ? '#107C10' : secPct >= 60 ? '#FFB900' : '#D13438';

  const riskSafe = riskScore?.safetyScore ?? null;
  const riskColor = riskSafe == null ? '#94a3b8' : riskSafe >= 80 ? '#107C10' : riskSafe >= 60 ? '#FFB900' : '#D13438';

  const alerts = defenderStatus?.alerts || [];
  const recs = (advisorRecommendations || []).filter(r => r.category === 'Security');
  const findings = riskScore?.findings || [];

  const allRecs = [
    ...(defenderStatus?.recommendations || []),
    ...recs,
  ];

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Security Center</h1>
          <p className="page-subtitle">
            Microsoft Defender for Cloud · Azure Advisor Security · Risk Engine
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Score Cards */}
      <div className="grid-3 mb-6">
        <div className="card p-5">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {loading
              ? <div className="skeleton skeleton-circle" style={{ width: 110, height: 110 }} />
              : <GaugeMeter value={secPct} color={secColor} />
            }
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Defender Secure Score
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: secColor, letterSpacing: '-0.02em' }}>
                {secPct != null ? `${Math.round(secPct)}%` : '—'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {secPct == null ? 'Not configured' : secPct >= 80 ? '✓ Good security posture' : secPct >= 60 ? '⚠ Needs attention' : '✗ Critical — act now'}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {loading
              ? <div className="skeleton skeleton-circle" style={{ width: 110, height: 110 }} />
              : <GaugeMeter value={riskSafe} color={riskColor} />
            }
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Risk Safety Score
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: riskColor, letterSpacing: '-0.02em' }}>
                {riskSafe != null ? `${Math.round(riskSafe)}%` : '—'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {riskScore ? `${riskScore.findingsCount} active findings` : 'Calculating…'}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Threat Summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Active Alerts', val: alerts.length, color: '#D13438', icon: AlertTriangle },
              { label: 'Security Recs', val: recs.length, color: '#FFB900', icon: AlertCircle },
              { label: 'Critical Findings', val: riskScore?.breakdown?.critical ?? 0, color: '#D13438', icon: XCircle },
              { label: 'High Findings', val: riskScore?.breakdown?.high ?? 0, color: '#c05500', icon: AlertTriangle },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${item.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <item.icon size={15} color={item.color} />
                </div>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>{item.label}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: item.val > 0 ? item.color : 'var(--success-600)' }}>
                  {loading ? '…' : item.val}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'recommendations', label: 'Recommendations', count: allRecs.length },
          { id: 'alerts', label: 'Active Alerts', count: alerts.length },
          { id: 'risk', label: 'Risk Findings', count: findings.length },
        ].map(tab => (
          <button
            key={tab.id}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id as any)}
          >
            {tab.label}
            {tab.count !== undefined && <span className="tab-badge">{loading ? '…' : tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div>
          {loading ? (
            <div className="grid-2">
              {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 16 }} />)}
            </div>
          ) : (
            <>
              {secPct != null && (securityScore?.categories || []).length > 0 && (
                <div className="card mb-5">
                  <div className="card-header">
                    <div className="card-title"><Shield size={16} color="var(--azure-600)" /> Security Categories</div>
                  </div>
                  <div className="card-body">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {(securityScore?.categories || []).map(cat => {
                        const pct = cat.maxScore > 0 ? (cat.score / cat.maxScore) * 100 : 0;
                        return (
                          <div key={cat.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{cat.name}</span>
                              <span style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{cat.score}/{cat.maxScore}</span>
                            </div>
                            <div className="progress-bar" style={{ height: 8 }}>
                              <div
                                className="progress-fill"
                                style={{
                                  width: `${pct}%`,
                                  background: pct >= 80 ? '#107C10' : pct >= 60 ? '#FFB900' : '#D13438',
                                }}
                              />
                            </div>
                            {cat.recommendations > 0 && (
                              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                {cat.recommendations} recommendation{cat.recommendations > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              {!securityScore && (
                <div className="empty-state">
                  <div className="empty-state-icon"><Shield size={28} /></div>
                  <div className="empty-state-title">Defender for Cloud data unavailable</div>
                  <div className="empty-state-desc">
                    Ensure Microsoft Defender for Cloud is enabled and your service principal has SecurityReader permissions.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'recommendations' && (
        <div className="card">
          <div className="card-body" style={{ paddingTop: 8 }}>
            {loading ? (
              [...Array(5)].map((_, i) => <div key={i} className="skeleton skeleton-row mb-2" style={{ borderRadius: 10 }} />)
            ) : allRecs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><CheckCircle size={28} color="var(--success-600)" /></div>
                <div className="empty-state-title">No security recommendations</div>
                <div className="empty-state-desc">Your Azure environment has no outstanding security recommendations.</div>
              </div>
            ) : (
              <div className="insight-list">
                {allRecs.map((rec: any, i: number) => {
                  const impactColor: Record<string, string> = { High: '#D13438', Medium: '#FFB900', Low: '#0078d4' };
                  const color = impactColor[rec.impact] || '#0078d4';
                  return (
                    <div key={rec.id || i} className="insight-item">
                      <div className="insight-icon" style={{ background: `${color}18` }}>
                        <Shield size={16} color={color} />
                      </div>
                      <div className="insight-content">
                        <div className="insight-title">{rec.title || rec.displayName}</div>
                        <div className="insight-desc">{rec.description}</div>
                        {rec.resourceId && <div className="insight-meta">{rec.resourceId.split('/').pop()}</div>}
                      </div>
                      <span className={`severity-badge ${(rec.impact || 'low').toLowerCase()}`}>{rec.impact}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="card">
          <div className="card-body" style={{ paddingTop: 8 }}>
            {loading ? (
              [...Array(4)].map((_, i) => <div key={i} className="skeleton skeleton-row mb-2" style={{ borderRadius: 10 }} />)
            ) : alerts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><CheckCircle size={28} color="var(--success-600)" /></div>
                <div className="empty-state-title">No active security alerts</div>
                <div className="empty-state-desc">No active threat alerts detected in this subscription.</div>
              </div>
            ) : (
              <div className="insight-list">
                {alerts.map((alert: any, i: number) => {
                  const sevColor: Record<string, string> = { Critical: '#D13438', High: '#c05500', Medium: '#b45309', Low: '#0078d4', Informational: '#64748b' };
                  const color = sevColor[alert.severity] || '#64748b';
                  return (
                    <div key={alert.id || i} className="insight-item">
                      <div className="insight-icon" style={{ background: `${color}18` }}>
                        <AlertTriangle size={16} color={color} />
                      </div>
                      <div className="insight-content">
                        <div className="insight-title">{alert.name || alert.displayName}</div>
                        <div className="insight-desc">{alert.description}</div>
                        <div className="insight-meta">{alert.firedAt ? new Date(alert.firedAt).toLocaleString() : ''}</div>
                      </div>
                      <span className={`severity-badge ${(alert.severity || 'low').toLowerCase()}`}>{alert.severity}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'risk' && (
        <div className="card">
          <div className="card-body" style={{ paddingTop: 8 }}>
            {loading ? (
              [...Array(5)].map((_, i) => <div key={i} className="skeleton skeleton-row mb-2" style={{ borderRadius: 10 }} />)
            ) : findings.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><CheckCircle size={28} color="var(--success-600)" /></div>
                <div className="empty-state-title">No risk findings</div>
                <div className="empty-state-desc">Your Azure environment passed all automated risk checks.</div>
              </div>
            ) : (
              <div className="insight-list">
                {findings.map((f: any, i: number) => {
                  const sevColor: Record<string, string> = { Critical: '#D13438', High: '#c05500', Medium: '#b45309', Low: '#0078d4' };
                  const color = sevColor[f.severity] || '#0078d4';
                  return (
                    <div key={i} className="insight-item">
                      <div className="insight-icon" style={{ background: `${color}18` }}>
                        <Lock size={15} color={color} />
                      </div>
                      <div className="insight-content">
                        <div className="insight-title">{f.finding}</div>
                        <div className="insight-desc">{f.recommendation}</div>
                        <div className="insight-meta">{f.resourceName} · {f.category}</div>
                      </div>
                      <span className={`severity-badge ${f.severity.toLowerCase()}`}>{f.severity}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
