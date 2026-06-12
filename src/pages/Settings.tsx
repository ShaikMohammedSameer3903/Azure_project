// ============================================================
// Platform Connections & Settings Component
// ============================================================

import { useState } from 'react';
import { Layers, Plus, Trash2, RefreshCw, Lock } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useAuth } from '../providers/AuthProvider';
import { api } from '../services/api';

export default function Settings() {
  const { user } = useAuth();
  const {
    subscriptions, setSubscriptions,
    activeSubscriptionId, setActiveSubscription
  } = useAppStore();

  // Connection form state
  const [subId, setSubId] = useState('');
  const [name, setName] = useState('');
  const [authType, setAuthType] = useState<'MSAL' | 'CREDENTIALS'>('MSAL');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [azureTenantId, setAzureTenantId] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isReadOnly = !['OWNER', 'ADMIN'].includes(user?.role || '');

  // 1. Register new subscription
  const handleConnectSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !subId || !name) return;

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await api.post<any>('/api/subscriptions', {
        subscriptionId: subId,
        name,
        clientId: authType === 'CREDENTIALS' ? clientId : undefined,
        clientSecret: authType === 'CREDENTIALS' ? clientSecret : undefined,
        azureTenantId: authType === 'CREDENTIALS' ? azureTenantId : undefined,
        authType
      });

      // Reload subscription list
      const updatedList = await api.get<any[]>('/api/subscriptions');
      setSubscriptions(updatedList);
      
      // Auto select the new sub
      setActiveSubscription(result.id);

      setSuccessMessage(result.message || 'Subscription connected successfully!');
      
      // Reset form
      setSubId('');
      setName('');
      setClientId('');
      setClientSecret('');
      setAzureTenantId('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to register subscription.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Disconnect a subscription
  const handleDisconnectSubscription = async (id: string) => {
    if (isReadOnly) return;
    if (!confirm('Are you sure you want to unregister this subscription? All cached resources and telemetry will be removed.')) return;

    try {
      await api.delete(`/api/subscriptions/${id}`);
      
      // Filter list locally
      const remaining = subscriptions.filter(s => s.id !== id);
      setSubscriptions(remaining);

      // Select another active sub if deleted one was active
      if (activeSubscriptionId === id) {
        setActiveSubscription(remaining.length > 0 ? remaining[0].id : null);
      }

      setSuccessMessage('Subscription disconnected successfully.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete subscription.');
    }
  };

  return (
    <div>
      <header className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Enterprise Connections & Settings</h1>
          <p className="page-subtitle">
            Manage your connected Azure subscriptions, tenant directories, and auth credentials.
          </p>
        </div>
      </header>

      {/* Messaging Banners */}
      {successMessage && (
        <div className="status-pill healthy mb-5" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 'var(--radius-md)', fontSize: 13.5 }}>
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="status-pill stopped mb-5" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 'var(--radius-md)', fontSize: 13.5 }}>
          <span>{errorMessage}</span>
        </div>
      )}

      {isReadOnly && (
        <div className="status-pill info mb-5" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 'var(--radius-md)', fontSize: 13.5 }}>
          <Lock size={16} />
          <span>Editing connection registries requires <strong>OWNER</strong> or <strong>ADMIN</strong> directory roles.</span>
        </div>
      )}

      <div className="grid-2">
        {/* Connected list */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Layers size={16} color="var(--azure-600)" />
              Connected Directories ({subscriptions.length})
            </h2>
          </div>
          <div className="card-body">
            <p className="card-subtitle mb-4">Currently monitored Azure subscription boundaries.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {subscriptions.length > 0 ? (
                subscriptions.map(s => (
                  <div 
                    className="card p-4"
                    key={s.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: activeSubscriptionId === s.id ? 'rgba(0,120,212,0.06)' : 'var(--bg-surface-secondary)',
                      borderColor: activeSubscriptionId === s.id ? 'var(--azure-600)' : 'var(--border-subtle)',
                      cursor: 'pointer'
                    }}
                    onClick={() => setActiveSubscription(s.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{s.displayName || s.name || 'Azure Subscription'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                        ID: {s.subscriptionId || s.subscription_id}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 10.5, background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {s.authType || s.auth_type} Auth
                        </span>
                        <span className={`status-pill ${s.status === 'Active' ? 'healthy' : 'info'}`} style={{ padding: '1px 6px', fontSize: 10 }}>
                          {s.status}
                        </span>
                      </div>
                    </div>

                    <button
                      className="btn btn-secondary btn-icon btn-sm text-red"
                      disabled={isReadOnly}
                      onClick={(e) => { e.stopPropagation(); handleDisconnectSubscription(s.id); }}
                      title="Disconnect subscription"
                      aria-label="Disconnect subscription"
                    >
                      <Trash2 size={14} color="#D13438" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon"><Layers size={24} /></div>
                  <div className="empty-state-title">No subscriptions connected</div>
                  <div className="empty-state-desc">No subscriptions connected yet. Connect one below.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Connect New form */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Plus size={16} color="var(--azure-600)" />
              Connect Azure Subscription
            </h2>
          </div>
          <div className="card-body">
            <p className="card-subtitle mb-4">Register a new Azure directory endpoint to index resources.</p>

            <form onSubmit={handleConnectSubscription} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Subscription Display Name</label>
                <input
                  type="text"
                  placeholder="Contoso Production"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isReadOnly || loading}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface-secondary)',
                    color: 'var(--text-primary)',
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Azure Subscription ID (UUID)</label>
                <input
                  type="text"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  value={subId}
                  onChange={(e) => setSubId(e.target.value)}
                  disabled={isReadOnly || loading}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface-secondary)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Authentication Type</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="authType"
                      checked={authType === 'MSAL'}
                      onChange={() => setAuthType('MSAL')}
                      disabled={isReadOnly || loading}
                    />
                    <span>User Consent OAuth (Interactive)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="authType"
                      checked={authType === 'CREDENTIALS'}
                      onChange={() => setAuthType('CREDENTIALS')}
                      disabled={isReadOnly || loading}
                    />
                    <span>Service Principal Client Secret (Silent background)</span>
                  </label>
                </div>
              </div>

              {authType === 'CREDENTIALS' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-surface-secondary)', padding: 14, borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Application (Client) ID</label>
                    <input
                      type="text"
                      placeholder="00000000-0000-0000-0000-000000000000"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      disabled={isReadOnly || loading}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                      }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Directory (Tenant) ID</label>
                    <input
                      type="text"
                      placeholder="00000000-0000-0000-0000-000000000000"
                      value={azureTenantId}
                      onChange={(e) => setAzureTenantId(e.target.value)}
                      disabled={isReadOnly || loading}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                      }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Client Secret Value</label>
                    <input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      disabled={isReadOnly || loading}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                      }}
                      required
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isReadOnly || loading}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {loading ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} />
                    Establishing Connection Link...
                  </>
                ) : (
                  'Establish Subscription Connection'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
