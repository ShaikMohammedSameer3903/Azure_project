// ============================================================
// Resources Page — Live Azure resource inventory
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Server, Search, RefreshCw, Download,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Database, Globe, Lock, HardDrive, Network, Cloud, Cpu,
  MoreVertical,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { api } from '../services/api';

const RESOURCE_ICONS: Record<string, { icon: any; color: string; bg: string }> = {
  'Microsoft.Compute': { icon: Cpu, color: '#0078d4', bg: '#eff6ff' },
  'Microsoft.Storage': { icon: HardDrive, color: '#107C10', bg: '#f0fdf4' },
  'Microsoft.Web':     { icon: Globe, color: '#8b5cf6', bg: '#f5f3ff' },
  'Microsoft.Sql':     { icon: Database, color: '#f97316', bg: '#fff7ed' },
  'Microsoft.KeyVault':{ icon: Lock, color: '#D13438', bg: '#fef2f2' },
  'Microsoft.Network': { icon: Network, color: '#00B7C3', bg: '#ecfeff' },
  default:             { icon: Server, color: '#64748b', bg: '#f8fafc' },
};

function getResourceIcon(type: string) {
  const ns = type?.split('/')?.[0] || '';
  return RESOURCE_ICONS[ns] || RESOURCE_ICONS.default;
}

function formatType(type: string): string {
  return type?.split('/')?.pop()?.replace(/([A-Z])/g, ' $1')?.trim() || type;
}

const PAGE_SIZE = 15;

export default function Resources() {
  const {
    resources, setResources,
    activeSubscriptionId,
    setResourceGroups,
    setResourcesLoading,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortCol, setSortCol] = useState<'name' | 'type' | 'location' | 'status' | 'risk_score' | 'cost_impact'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [discovering, setDiscovering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<any | null>(null);

  const fetchResources = async () => {
    if (!activeSubscriptionId) return;
    setLoading(true);
    setResourcesLoading(true);
    try {
      const [res, groups] = await Promise.all([
        api.get<any[]>('/api/resources', { params: { subscriptionId: activeSubscriptionId } }),
        api.get<any[]>(`/api/resources/groups/${activeSubscriptionId}`).catch(() => []),
      ]);
      setResources(res);
      if (groups.length > 0) setResourceGroups(groups);
    } catch (err) {
      console.error('[Resources] Fetch failed:', err);
    } finally {
      setLoading(false);
      setResourcesLoading(false);
    }
  };

  const triggerDiscovery = async () => {
    if (!activeSubscriptionId) return;
    setDiscovering(true);
    try {
      await api.post(`/api/subscriptions/${activeSubscriptionId}/sync`);
      await fetchResources();
    } catch (err) {
      console.error('[Resources] Discovery failed:', err);
    } finally {
      setDiscovering(false);
    }
  };

  useEffect(() => { fetchResources(); }, [activeSubscriptionId]);

  // ── Filtering & sorting ─────────────────────────────────

  const groups = useMemo(() => [...new Set(resources.map(r => r.resource_group || r.resourceGroup))].sort(), [resources]);
  const statuses = useMemo(() => [...new Set(resources.map(r => r.status))].sort(), [resources]);

  const filtered = useMemo(() => {
    let list = resources;
    
    // Filter by global environment sector selector
    const activeEnv = useAppStore.getState().activeEnvironment;
    if (activeEnv !== 'All') {
      list = list.filter(r => r.tags?.Environment?.toLowerCase() === activeEnv.toLowerCase() || r.tags?.environment?.toLowerCase() === activeEnv.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        r.type?.toLowerCase().includes(q) ||
        (r.resource_group || r.resourceGroup)?.toLowerCase().includes(q) ||
        r.location?.toLowerCase().includes(q) ||
        (r as any).owner?.toLowerCase().includes(q)
      );
    }
    if (filterType) list = list.filter(r => r.type === filterType);
    if (filterGroup) list = list.filter(r => (r.resource_group || r.resourceGroup) === filterGroup);
    if (filterStatus) list = list.filter(r => r.status === filterStatus);

    list = [...list].sort((a, b) => {
      let aVal: any = a.name;
      let bVal: any = b.name;
      if (sortCol === 'type') { aVal = a.type; bVal = b.type; }
      else if (sortCol === 'location') { aVal = a.location; bVal = b.location; }
      else if (sortCol === 'status') { aVal = a.status; bVal = b.status; }
      else if (sortCol === 'risk_score') { aVal = (a as any).risk_score || 0; bVal = (b as any).risk_score || 0; }
      else if (sortCol === 'cost_impact') { aVal = (a as any).cost_impact || 0; bVal = (b as any).cost_impact || 0; }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDir === 'asc'
        ? (aVal || '').toString().localeCompare((bVal || '').toString())
        : (bVal || '').toString().localeCompare((aVal || '').toString());
    });

    return list;
  }, [resources, search, filterType, filterGroup, filterStatus, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) =>
    sortCol === col
      ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
      : null;

  const exportCSV = () => {
    const cols = ['name', 'type', 'location', 'resource_group', 'status', 'owner', 'cost_impact', 'risk_score', 'health_status'];
    const rows = filtered.map(r =>
      cols.map(c => `"${(r as any)[c] || ''}"`).join(',')
    );
    const csv = [cols.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `azure-resources-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Resource Inventory</h1>
          <p className="page-subtitle">
            {resources.length} resources across {groups.length} resource groups
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-secondary btn-sm" onClick={fetchResources} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={triggerDiscovery} disabled={discovering}>
            {discovering ? <><div className="spinner spinner-sm" />Syncing…</> : <><Cloud size={14} />Sync Discovery</>}
          </button>
        </div>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { label: 'Virtual Machines', type: 'Microsoft.Compute/virtualMachines', color: '#0078d4' },
          { label: 'Storage Accounts', type: 'Microsoft.Storage/storageAccounts', color: '#107C10' },
          { label: 'App Services', type: 'Microsoft.Web/sites', color: '#8b5cf6' },
          { label: 'SQL Databases', type: 'Microsoft.Sql/servers/databases', color: '#f97316' },
          { label: 'Key Vaults', type: 'Microsoft.KeyVault/vaults', color: '#D13438' },
        ].map(chip => {
          const count = resources.filter(r => r.type === chip.type).length;
          return (
            <button
              key={chip.type}
              onClick={() => setFilterType(filterType === chip.type ? '' : chip.type)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '5px 12px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${filterType === chip.type ? chip.color : 'var(--border-default)'}`,
                background: filterType === chip.type ? `${chip.color}12` : 'var(--bg-surface)',
                color: filterType === chip.type ? chip.color : 'var(--text-secondary)',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              <span>{chip.label}</span>
              <span style={{
                background: filterType === chip.type ? chip.color : 'var(--bg-surface-tertiary)',
                color: filterType === chip.type ? 'white' : 'var(--text-secondary)',
                borderRadius: 'var(--radius-full)',
                padding: '1px 6px', fontSize: 11, fontWeight: 700,
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="table-wrapper">
        {/* Toolbar */}
        <div className="table-toolbar">
          <div className="table-search-wrapper" style={{ maxWidth: 300 }}>
            <Search size={14} className="table-search-icon" />
            <input
              type="text"
              className="table-search"
              placeholder="Search by name, type, owner…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              aria-label="Search resources"
            />
          </div>

          <div className="select-wrapper" style={{ minWidth: 160 }}>
            <select
              className="form-select"
              value={filterGroup}
              onChange={e => { setFilterGroup(e.target.value); setPage(1); }}
              aria-label="Filter by resource group"
            >
              <option value="">All Resource Groups</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="select-wrapper" style={{ minWidth: 140 }}>
            <select
              className="form-select"
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="ml-auto" style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {filtered.length} of {resources.length} resources
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '0 0 4px' }}>
            {[...Array(8)].map((_, i) => <div key={i} className="skeleton skeleton-row" style={{ margin: '4px 12px', borderRadius: 8 }} />)}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th className="sortable" onClick={() => handleSort('type')}>
                  Type <SortIcon col="type" />
                </th>
                <th>Owner</th>
                <th className="sortable" onClick={() => handleSort('cost_impact')}>
                  Cost <SortIcon col="cost_impact" />
                </th>
                <th className="sortable" onClick={() => handleSort('risk_score')}>
                  Risk <SortIcon col="risk_score" />
                </th>
                <th className="sortable" onClick={() => handleSort('status')}>
                  Status <SortIcon col="status" />
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-state-icon"><Server size={28} /></div>
                      <div className="empty-state-title">No resources found</div>
                      <div className="empty-state-desc">
                        {resources.length === 0
                          ? 'Click "Sync Discovery" to scan your Azure subscription.'
                          : 'Try adjusting your search or filter criteria.'}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : paginated.map(r => {
                const { icon: Icon, color, bg } = getResourceIcon(r.type || '');
                const statusClass = (['Running', 'Online', 'Active', 'Available', 'Succeeded'].includes(r.status || ''))
                  ? 'healthy' : (['Stopped', 'Deallocated', 'Failed'].includes(r.status || ''))
                    ? 'stopped' : 'info';
                
                const riskVal = (r as any).risk_score || 0;
                const riskBadge = riskVal >= 70 ? 'danger' : riskVal >= 35 ? 'warning' : 'success';
                
                return (
                  <tr key={r.id} onClick={() => setSelectedResource(r)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="resource-type-icon" style={{ background: bg, color }}>
                          <Icon size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                            {(r.resource_group || r.resourceGroup)} • {r.location}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="muted">{formatType(r.type)}</td>
                    <td className="muted">{(r as any).owner || 'Unassigned'}</td>
                    <td style={{ fontWeight: 600 }}>${(r as any).cost_impact || 0}/mo</td>
                    <td>
                      <span className={`status-pill ${riskBadge}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {riskVal}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${statusClass}`}>
                        {r.status || 'Unknown'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-icon btn-sm" aria-label="More actions" onClick={(e) => { e.stopPropagation(); setSelectedResource(r); }}>
                        <MoreVertical size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </div>
            <div className="pagination-controls">
              <button className="pagination-btn" onClick={() => setPage(1)} disabled={page === 1} aria-label="First page">«</button>
              <button className="pagination-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1} aria-label="Previous page">
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                return (
                  <button key={p} className={`pagination-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                );
              })}
              <button className="pagination-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages} aria-label="Next page">
                <ChevronRight size={14} />
              </button>
              <button className="pagination-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages} aria-label="Last page">»</button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-out detail drawer */}
      {selectedResource && (
        <div className="modal-backdrop" onClick={() => setSelectedResource(null)}>
          <div className="modal" style={{ maxWidth: 650, width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{selectedResource.name}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedResource(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <strong style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Resource ID</strong>
                  <div style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{selectedResource.id}</div>
                </div>
                <div>
                  <strong style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Resource Type</strong>
                  <div>{selectedResource.type}</div>
                </div>
                <div>
                  <strong style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Location</strong>
                  <div>{selectedResource.location}</div>
                </div>
                <div>
                  <strong style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Resource Group</strong>
                  <div>{selectedResource.resource_group || selectedResource.resourceGroup}</div>
                </div>
                <div>
                  <strong style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Owner</strong>
                  <div>{selectedResource.owner || 'Unassigned'}</div>
                </div>
                <div>
                  <strong style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Last Modified</strong>
                  <div>{new Date(selectedResource.last_modified).toLocaleString()}</div>
                </div>
                <div>
                  <strong style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Monthly Cost Impact</strong>
                  <div>${selectedResource.cost_impact || 0} USD</div>
                </div>
                <div>
                  <strong style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Risk & Compliance Score</strong>
                  <div>{selectedResource.risk_score || 0} / 100</div>
                </div>
              </div>

              <div>
                <strong style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Tags</strong>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                  {Object.keys(selectedResource.tags || {}).length > 0 ? (
                    Object.entries(selectedResource.tags).map(([k, v]) => (
                      <span key={k} className="status-pill info" style={{ fontSize: 11 }}>
                        {k}: {v as string}
                      </span>
                    ))
                  ) : (
                    <span className="muted" style={{ fontSize: 12.5 }}>No tags defined on this resource.</span>
                  )}
                </div>
              </div>

              <div>
                <strong style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Raw Properties (Payload)</strong>
                <pre style={{
                  background: 'var(--bg-surface-tertiary)',
                  padding: 10,
                  borderRadius: 6,
                  overflowX: 'auto',
                  fontSize: 12,
                  maxHeight: 250,
                  fontFamily: 'var(--font-mono)'
                }}>
                  {JSON.stringify(selectedResource.raw_payload || {}, null, 2)}
                </pre>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedResource(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

