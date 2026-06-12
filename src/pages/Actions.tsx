// ============================================================
// Operations Actions and Provisioning Wizards Component
// ============================================================

import { useState, useMemo } from 'react';
import { 
  Play, Square, RotateCw, Cpu, HardDrive, 
  Layers, Lock, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useAuth } from '../providers/AuthProvider';
import { api } from '../services/api';

export default function Actions() {
  const { user } = useAuth();
  const {
    resources,
    activeSubscriptionId,
    setResources
  } = useAppStore();

  // Selected subscription's virtual machines
  const vms = useMemo(() => {
    return resources.filter(r => r.type === 'Microsoft.Compute/virtualMachines');
  }, [resources]);

  // Unique Resource Groups for selector dropdowns
  const resourceGroups = useMemo(() => {
    const rgs = new Set<string>();
    resources.forEach(r => {
      if (r.resource_group) rgs.add(r.resource_group);
      else if (r.resourceGroup) rgs.add(r.resourceGroup);
    });
    return Array.from(rgs);
  }, [resources]);

  // Action status/notifications
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // resourceId of currently running VM action

  // Forms state
  const [rgName, setRgName] = useState('');
  const [rgLocation, setRgLocation] = useState('southeastasia');
  const [rgLoading, setRgLoading] = useState(false);

  const [saName, setSaName] = useState('');
  const [saGroup, setSaGroup] = useState('');
  const [saLocation, setSaLocation] = useState('southeastasia');
  const [saLoading, setSaLoading] = useState(false);

  const [vmName, setVmName] = useState('');
  const [vmGroup, setVmGroup] = useState('');
  const [vmLocation, setVmLocation] = useState('southeastasia');
  const [vmSize, setVmSize] = useState('Standard_D2s_v5');
  const [vmOs, setVmOs] = useState('Ubuntu 22.04 LTS');
  const [vmLoading, setVmLoading] = useState(false);

  // Check if role has writing permission
  const isReadOnly = ['VIEWER', 'AUDITOR'].includes(user?.role || '');

  // 1. VM Power Actions (Start, Stop, Restart)
  const handleVmPowerAction = async (resourceId: string, action: 'start' | 'stop' | 'restart') => {
    if (isReadOnly) return;
    setActionLoading(resourceId);
    setActionMessage(null);

    try {
      const result = await api.post<any>('/api/actions/vm', {
        subscriptionId: activeSubscriptionId,
        resourceId,
        action
      });

      // Update resource state locally in Zustand store
      setResources(
        resources.map(r => r.id === resourceId ? { ...r, status: result.status } : r)
      );

      setActionMessage({ type: 'success', text: result.message });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Action failed.' });
    } finally {
      setActionLoading(null);
    }
  };

  // 2. Create Resource Group
  const handleCreateRg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !rgName) return;
    setRgLoading(true);
    setActionMessage(null);

    try {
      const result = await api.post<any>('/api/actions/resource-group', {
        subscriptionId: activeSubscriptionId,
        name: rgName,
        location: rgLocation
      });

      // Trigger resource reload or update cache locally
      const newRg = {
        id: result.id,
        resourceId: result.id,
        name: rgName,
        type: 'Microsoft.Resources/resourceGroups',
        resourceTypeFull: 'Microsoft.Resources/resourceGroups',
        location: rgLocation,
        resourceGroup: rgName,
        resource_group: rgName,
        subscriptionId: activeSubscriptionId || '',
        subscription_id: activeSubscriptionId || '',
        provisioningState: 'Succeeded',
        status: 'Active',
        tags: {},
        lastSynced: new Date().toISOString()
      };
      setResources([...resources, newRg]);

      setActionMessage({ type: 'success', text: result.message });
      setRgName('');
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create Resource Group.' });
    } finally {
      setRgLoading(false);
    }
  };

  // 3. Create Storage Account
  const handleCreateSa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !saName || !saGroup) return;
    setSaLoading(true);
    setActionMessage(null);

    try {
      const result = await api.post<any>('/api/actions/storage-account', {
        subscriptionId: activeSubscriptionId,
        name: saName,
        resourceGroup: saGroup,
        location: saLocation
      });

      const newSa = {
        id: result.id,
        resourceId: result.id,
        name: saName,
        type: 'Microsoft.Storage/storageAccounts',
        resourceTypeFull: 'Microsoft.Storage/storageAccounts',
        location: saLocation,
        resourceGroup: saGroup,
        resource_group: saGroup,
        subscriptionId: activeSubscriptionId || '',
        subscription_id: activeSubscriptionId || '',
        provisioningState: 'Succeeded',
        status: 'Available',
        tags: { Environment: 'Production' },
        lastSynced: new Date().toISOString()
      };
      setResources([...resources, newSa]);

      setActionMessage({ type: 'success', text: result.message });
      setSaName('');
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create Storage Account.' });
    } finally {
      setSaLoading(false);
    }
  };

  // 4. Deploy VM
  const handleDeployVm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !vmName || !vmGroup) return;
    setVmLoading(true);
    setActionMessage(null);

    try {
      const result = await api.post<any>('/api/actions/deploy-vm', {
        subscriptionId: activeSubscriptionId,
        name: vmName,
        resourceGroup: vmGroup,
        location: vmLocation,
        size: vmSize,
        os: vmOs
      });

      const newVm = {
        id: result.id,
        resourceId: result.id,
        name: vmName,
        type: 'Microsoft.Compute/virtualMachines',
        resourceTypeFull: 'Microsoft.Compute/virtualMachines',
        location: vmLocation,
        resourceGroup: vmGroup,
        resource_group: vmGroup,
        subscriptionId: activeSubscriptionId || '',
        subscription_id: activeSubscriptionId || '',
        provisioningState: 'Succeeded',
        status: 'Running',
        tags: { Environment: 'Staging' },
        lastSynced: new Date().toISOString()
      };
      setResources([...resources, newVm]);

      setActionMessage({ type: 'success', text: result.message });
      setVmName('');
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'VM Deployment failed.' });
    } finally {
      setVmLoading(false);
    }
  };

  return (
    <div>
      <header className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Operations Center & Provisioning</h1>
          <p className="page-subtitle">
            Perform VM control power cycles and trigger automated Bicep deployments.
          </p>
        </div>
      </header>

      {/* Global Action Banner */}
      {actionMessage && (
        <div className={`status-pill ${actionMessage.type === 'success' ? 'healthy' : 'stopped'} mb-5`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 'var(--radius-md)', fontSize: 13.5 }}>
          {actionMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {isReadOnly && (
        <div className="status-pill info mb-5" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 'var(--radius-md)', fontSize: 13.5 }}>
          <Lock size={16} />
          <span>Your active directory role <strong>{user?.role}</strong> is restricted to read-only scopes. Write operations are disabled.</span>
        </div>
      )}

      <div className="grid-2">
        {/* Left column: VM management list */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Cpu size={16} color="var(--azure-600)" />
              Virtual Machine Power States
            </h2>
          </div>
          <div className="card-body">
            <p className="card-subtitle mb-4">Start, stop, or reboot virtual servers deployed in this subscription.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {vms.length > 0 ? (
                vms.map(vm => {
                  const isLoading = actionLoading === vm.id;
                  const isRunning = vm.status === 'Running' || vm.status === 'Online';
                  
                  return (
                    <div className="card p-4" key={vm.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface-secondary)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{vm.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                          <span>{vm.resource_group}</span>
                          <span>•</span>
                          <span className={`status-pill ${isRunning ? 'healthy' : 'stopped'}`} style={{ padding: '1px 6px', fontSize: 10 }}>
                            {vm.status}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-secondary btn-icon btn-sm"
                          disabled={isReadOnly || isRunning || isLoading}
                          onClick={() => handleVmPowerAction(vm.id, 'start')}
                          title="Start VM"
                          aria-label="Start VM"
                        >
                          <Play size={14} color="#107C10" />
                        </button>
                        <button
                          className="btn btn-secondary btn-icon btn-sm"
                          disabled={isReadOnly || !isRunning || isLoading}
                          onClick={() => handleVmPowerAction(vm.id, 'stop')}
                          title="Stop VM"
                          aria-label="Stop VM"
                        >
                          <Square size={14} color="#D13438" />
                        </button>
                        <button
                          className="btn btn-secondary btn-icon btn-sm"
                          disabled={isReadOnly || !isRunning || isLoading}
                          onClick={() => handleVmPowerAction(vm.id, 'restart')}
                          title="Restart VM"
                          aria-label="Restart VM"
                        >
                          <RotateCw size={14} color="#0078d4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon"><Cpu size={24} /></div>
                  <div className="empty-state-title">No VMs found</div>
                  <div className="empty-state-desc">No Virtual Machines discovered in this subscription.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Provisioning Wizards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 1. Create Resource Group */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <Layers size={16} color="var(--azure-600)" />
                Create Resource Group
              </h3>
            </div>
            <div className="card-body">
              <form onSubmit={handleCreateRg} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <input
                    type="text"
                    placeholder="rg-project-environment"
                    value={rgName}
                    onChange={(e) => setRgName(e.target.value)}
                    disabled={isReadOnly || rgLoading}
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
                  <select
                    value={rgLocation}
                    onChange={(e) => setRgLocation(e.target.value)}
                    disabled={isReadOnly || rgLoading}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="southeastasia">Southeast Asia (Singapore)</option>
                    <option value="eastus">East US (Virginia)</option>
                    <option value="westus2">West US 2 (Washington)</option>
                  </select>
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isReadOnly || rgLoading}
                  style={{ width: '100%' }}
                >
                  {rgLoading ? 'Creating...' : 'Provision Resource Group'}
                </button>
              </form>
            </div>
          </div>

          {/* 2. Create Storage Account */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <HardDrive size={16} color="#107C10" />
                Create Storage Account
              </h3>
            </div>
            <div className="card-body">
              <form onSubmit={handleCreateSa} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <input
                    type="text"
                    placeholder="sauniquename"
                    value={saName}
                    onChange={(e) => setSaName(e.target.value)}
                    disabled={isReadOnly || saLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                    required
                  />
                  <select
                    value={saGroup}
                    onChange={(e) => setSaGroup(e.target.value)}
                    disabled={isReadOnly || saLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                    required
                  >
                    <option value="">Select Resource Group</option>
                    {resourceGroups.map(rg => (
                      <option key={rg} value={rg}>{rg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={saLocation}
                    onChange={(e) => setSaLocation(e.target.value)}
                    disabled={isReadOnly || saLoading}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="southeastasia">Southeast Asia</option>
                    <option value="eastus">East US</option>
                    <option value="westus2">West US 2</option>
                  </select>
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isReadOnly || saLoading || !saGroup}
                  style={{ width: '100%' }}
                >
                  {saLoading ? 'Provisioning...' : 'Provision Storage Account'}
                </button>
              </form>
            </div>
          </div>

          {/* 3. Deploy Virtual Machine */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <Cpu size={16} color="var(--azure-600)" />
                Deploy Virtual Machine Wizard
              </h3>
            </div>
            <div className="card-body">
              <form onSubmit={handleDeployVm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <input
                    type="text"
                    placeholder="vm-web-staging"
                    value={vmName}
                    onChange={(e) => setVmName(e.target.value)}
                    disabled={isReadOnly || vmLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                    required
                  />
                  <select
                    value={vmGroup}
                    onChange={(e) => setVmGroup(e.target.value)}
                    disabled={isReadOnly || vmLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                    required
                  >
                    <option value="">Select Resource Group</option>
                    {resourceGroups.map(rg => (
                      <option key={rg} value={rg}>{rg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={vmLocation}
                    onChange={(e) => setVmLocation(e.target.value)}
                    disabled={isReadOnly || vmLoading}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="southeastasia">Southeast Asia (Singapore)</option>
                    <option value="eastus">East US (Virginia)</option>
                    <option value="westus2">West US 2 (Washington)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <select
                    value={vmSize}
                    onChange={(e) => setVmSize(e.target.value)}
                    disabled={isReadOnly || vmLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="Standard_B2s">Standard_B2s (2 vCPU, 4GB RAM)</option>
                    <option value="Standard_D2s_v5">Standard_D2s_v5 (2 vCPU, 8GB RAM)</option>
                    <option value="Standard_D4s_v5">Standard_D4s_v5 (4 vCPU, 16GB RAM)</option>
                  </select>
                  <select
                    value={vmOs}
                    onChange={(e) => setVmOs(e.target.value)}
                    disabled={isReadOnly || vmLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="Ubuntu 22.04 LTS">Ubuntu 22.04 LTS</option>
                    <option value="Windows Server 2022">Windows Server 2022</option>
                  </select>
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isReadOnly || vmLoading || !vmGroup}
                  style={{ width: '100%' }}
                >
                  {vmLoading ? 'Deploying Bicep Template...' : 'Deploy Virtual Machine'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
