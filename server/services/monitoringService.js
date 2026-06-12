// ============================================================
// Monitoring and Telemetry Service
// Uses real Azure APIs when credentials are available.
// Falls back to rich demo data for mock/demo subscriptions.
// ============================================================

const { getAzureClients } = require('./azureCredentialManager');
const { getDatabase } = require('../db/database');

// ── Demo data generators ────────────────────────────────────

function generateDemoCostData(subId) {
  const isHealthcare = subId === 'sub-healthcare-prod';
  const isUniversity = subId === 'sub-university-prod';
  const baseBudget = isHealthcare ? 2500 : isUniversity ? 1800 : 1200;
  const spendRatio = isHealthcare ? 0.82 : isUniversity ? 0.61 : 0.48;

  const currentSpend = Math.round(baseBudget * spendRatio * 100) / 100;

  const today = new Date();
  const dailyBreakdown = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const base = currentSpend / 30;
    const jitter = base * (0.6 + Math.random() * 0.8);
    dailyBreakdown.push({ date: dateStr, cost: Math.round(jitter * 100) / 100 });
  }

  const byService = isHealthcare
    ? [
        { service: 'Microsoft.Web', cost: 480 },
        { service: 'Microsoft.KeyVault', cost: 120 },
        { service: 'Microsoft.Insights', cost: 95 },
        { service: 'Microsoft.RecoveryServices', cost: 210 },
        { service: 'Microsoft.OperationalInsights', cost: 340 },
        { service: 'Azure Monitor', cost: 110 },
      ]
    : isUniversity
    ? [
        { service: 'Microsoft.Web', cost: 320 },
        { service: 'Microsoft.Storage', cost: 185 },
        { service: 'Microsoft.KeyVault', cost: 60 },
        { service: 'Microsoft.Insights', cost: 85 },
        { service: 'Microsoft.OperationalInsights', cost: 180 },
        { service: 'Azure Monitor', cost: 75 },
      ]
    : [
        { service: 'Microsoft.Compute', cost: 290 },
        { service: 'Microsoft.Storage', cost: 120 },
        { service: 'Microsoft.Network', cost: 80 },
      ];

  const projectedSpend = Math.round((currentSpend / new Date().getDate()) * 30 * 100) / 100;

  return { currentSpend, projectedSpend, budget: baseBudget, currency: 'USD', dailyBreakdown, byService };
}

function generateDemoBackupData(subId) {
  const isHealthcare = subId === 'sub-healthcare-prod';
  if (!isHealthcare) {
    return {
      vaults: [],
      totalProtectedItems: 0,
      totalBackupJobs: 0,
      failedJobs: 0,
      healthScore: null,
      message: 'No Recovery Services Vaults found in this subscription.'
    };
  }

  const recentJobs = [
    { name: 'rsv-hc-prod-backup-job-001', vaultName: 'rsv-hc-prod-backup', status: 'Completed', type: 'AzureIaasVM', timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
    { name: 'rsv-hc-prod-backup-job-002', vaultName: 'rsv-hc-prod-backup', status: 'Completed', type: 'AzureWorkload', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
    { name: 'rsv-hc-prod-backup-job-003', vaultName: 'rsv-hc-prod-backup', status: 'Completed', type: 'AzureIaasVM', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString() },
  ];

  return {
    vaults: [{ name: 'rsv-hc-prod-backup', id: '/subscriptions/demo/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.RecoveryServices/vaults/rsv-hc-prod-backup', location: 'southeastasia' }],
    totalProtectedItems: 5,
    totalBackupJobs: 3,
    failedJobs: 0,
    healthScore: 100,
    recentJobs,
  };
}

function generateDemoMetrics(resourceId) {
  const now = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const ts = new Date(now.getTime() - (23 - i) * 3600 * 1000);
    return {
      timestamp: ts.toISOString(),
      cpuPercentage: Math.round((10 + Math.random() * 30) * 10) / 10,
      memoryAvailableBytes: Math.floor(2 * 1024 * 1024 * 1024 * (0.4 + Math.random() * 0.4)),
      networkInBytes: Math.floor(Math.random() * 5000000),
      networkOutBytes: Math.floor(Math.random() * 3000000),
    };
  });
}

// ── Service functions ───────────────────────────────────────

/**
 * Get time-series metrics (CPU, Memory, Network) from Azure Monitor.
 */
async function getResourceMetrics(tenantId, subscriptionId, resourceId) {
  const clients = await getAzureClients(tenantId, subscriptionId);

  if (clients.isDemo) {
    return generateDemoMetrics(resourceId);
  }

  const monitorClient = clients.monitorClient;
  const timespan = 'PT24H';
  const interval = 'PT1H';

  let metricNames = 'Percentage CPU';
  if (resourceId.toLowerCase().includes('/providers/microsoft.web/sites')) {
    metricNames = 'CpuTime';
  } else if (resourceId.toLowerCase().includes('/providers/microsoft.sql/servers')) {
    metricNames = 'cpu_percent';
  } else if (resourceId.toLowerCase().includes('/providers/microsoft.storage')) {
    metricNames = 'Transactions';
  }

  const cpuMetrics = await monitorClient.metrics.list(resourceId, {
    metricnames: metricNames,
    timespan,
    interval,
    aggregation: 'Average'
  });

  let memoryMetrics = null;
  try {
    memoryMetrics = await monitorClient.metrics.list(resourceId, {
      metricnames: 'Available Memory Bytes',
      timespan,
      interval,
      aggregation: 'Average'
    });
  } catch (_) {}

  let networkInMetrics = null;
  let networkOutMetrics = null;
  try {
    networkInMetrics = await monitorClient.metrics.list(resourceId, {
      metricnames: 'Network In Total',
      timespan,
      interval,
      aggregation: 'Total'
    });
    networkOutMetrics = await monitorClient.metrics.list(resourceId, {
      metricnames: 'Network Out Total',
      timespan,
      interval,
      aggregation: 'Total'
    });
  } catch (_) {}

  const cpuTimeSeries = cpuMetrics.value?.[0]?.timeseries?.[0]?.data || [];
  const memTimeSeries = memoryMetrics?.value?.[0]?.timeseries?.[0]?.data || [];
  const netInTimeSeries = networkInMetrics?.value?.[0]?.timeseries?.[0]?.data || [];
  const netOutTimeSeries = networkOutMetrics?.value?.[0]?.timeseries?.[0]?.data || [];

  return cpuTimeSeries.map((d, i) => ({
    timestamp: d.timeStamp instanceof Date ? d.timeStamp.toISOString() : d.timeStamp,
    cpuPercentage: d.average !== undefined ? Math.round(d.average * 10) / 10 : null,
    memoryAvailableBytes: memTimeSeries[i]?.average ?? null,
    networkInBytes: netInTimeSeries[i]?.total ?? null,
    networkOutBytes: netOutTimeSeries[i]?.total ?? null,
  }));
}

/**
 * Get aggregated cost consumption stats from Azure Cost Management.
 */
async function getCostConsumption(tenantId, subscriptionId) {
  const db = await getDatabase();
  const sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);

  if (clients.isDemo) {
    return generateDemoCostData(sub.id);
  }

  const budgetRecord = await db.get(
    'SELECT amount FROM cost_budgets WHERE subscription_id = ?',
    [sub.id]
  );
  const budget = budgetRecord ? budgetRecord.amount : null;

  const consumptionClient = clients.consumptionClient;
  const realSubId = sub.subscription_id;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 30);

  const usagePager = consumptionClient.usageDetails.list(
    `/subscriptions/${realSubId}`,
    {
      expand: 'properties/meterDetails',
      filter: `properties/usageStart ge '${startDate.toISOString().split('T')[0]}' and properties/usageEnd le '${endDate.toISOString().split('T')[0]}'`
    }
  );

  let currentSpend = 0;
  const dailyMap = {};
  const serviceMap = {};

  for await (const detail of usagePager) {
    const cost = detail.pretaxCost || detail.cost || 0;
    currentSpend += cost;

    const dateStr = (detail.usageStart || new Date()).toISOString().split('T')[0];
    dailyMap[dateStr] = (dailyMap[dateStr] || 0) + cost;

    const service = detail.consumedService || detail.meterDetails?.serviceName || 'Other';
    serviceMap[service] = (serviceMap[service] || 0) + cost;
  }

  const dailyBreakdown = Object.entries(dailyMap)
    .map(([date, cost]) => ({ date, cost: Math.round(cost * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byService = Object.entries(serviceMap)
    .map(([service, cost]) => ({ service, cost: Math.round(cost * 100) / 100 }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  const currentDay = new Date().getDate();
  const totalDaysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projectedSpend = Math.round((currentSpend / Math.max(1, currentDay)) * totalDaysInMonth * 100) / 100;

  return {
    currentSpend: Math.round(currentSpend * 100) / 100,
    projectedSpend,
    budget,
    currency: 'USD',
    dailyBreakdown,
    byService
  };
}

/**
 * Discover all Recovery Services Vaults and return backup health.
 */
async function getBackupHealth(tenantId, subscriptionId) {
  const db = await getDatabase();
  const sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);

  if (clients.isDemo) {
    return generateDemoBackupData(sub.id);
  }

  const backupClient = clients.backupClient;
  const resourceClient = clients.resourceClient;

  const vaultPager = resourceClient.resources.list({
    filter: "resourceType eq 'Microsoft.RecoveryServices/vaults'"
  });

  const vaults = [];
  for await (const v of vaultPager) {
    vaults.push(v);
  }

  if (vaults.length === 0) {
    return {
      vaults: [],
      totalProtectedItems: 0,
      totalBackupJobs: 0,
      failedJobs: 0,
      healthScore: null,
      message: 'No Recovery Services Vaults found in this subscription.'
    };
  }

  let totalProtected = 0;
  let totalJobs = 0;
  let totalFailed = 0;
  const recentJobs = [];

  for (const vault of vaults) {
    const rgMatch = vault.id.match(/\/resourceGroups\/([^/]+)/i);
    const rg = rgMatch ? rgMatch[1] : '';
    const vaultName = vault.name;

    try {
      const jobsPager = backupClient.backupJobs.list(vaultName, rg);
      for await (const j of jobsPager) {
        totalJobs++;
        if (j.properties?.status === 'Failed') totalFailed++;
        if (recentJobs.length < 10) {
          recentJobs.push({
            name: j.name,
            vaultName,
            status: j.properties?.status || 'Unknown',
            type: j.properties?.workloadType || 'Unknown',
            timestamp: j.properties?.startTime instanceof Date
              ? j.properties.startTime.toISOString()
              : j.properties?.startTime || new Date().toISOString()
          });
        }
      }

      const itemsPager = backupClient.backupProtectedItems.list(vaultName, rg);
      for await (const it of itemsPager) {
        totalProtected++;
      }
    } catch (vaultErr) {
      console.warn(`[MONITORING] Skipping vault ${vaultName}: ${vaultErr.message}`);
    }
  }

  const healthScore = totalJobs === 0
    ? null
    : Math.max(0, Math.round(100 - (totalFailed / totalJobs) * 100));

  return {
    vaults: vaults.map(v => ({ name: v.name, id: v.id, location: v.location })),
    totalProtectedItems: totalProtected,
    totalBackupJobs: totalJobs,
    failedJobs: totalFailed,
    healthScore,
    recentJobs: recentJobs.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  };
}

/**
 * Get active Azure Monitor alerts for a subscription.
 */
async function getActiveAlerts(tenantId, subscriptionId) {
  const db = await getDatabase();
  const sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);

  if (clients.isDemo) {
    // Return demo alerts based on seeded incidents
    return [
      {
        id: 'alert-demo-001',
        name: 'High CPU Alert',
        severity: 'Sev2',
        state: 'New',
        condition: 'Percentage CPU > 85%',
        targetResource: 'vm-hc-prod-web',
        firedAt: new Date(Date.now() - 3600000).toISOString(),
        description: 'CPU utilization exceeded 85% threshold.'
      }
    ];
  }

  const alerts = [];
  try {
    const monitorClient = clients.monitorClient;
    const alertsPager = monitorClient.alertsManagement
      ? monitorClient.alertsManagement.getAll()
      : null;

    if (alertsPager) {
      for await (const alert of alertsPager) {
        alerts.push({
          id: alert.id,
          name: alert.name,
          severity: alert.properties?.severity || 'Unknown',
          state: alert.properties?.alertState || 'Unknown',
          condition: alert.properties?.condition?.allOf?.[0]?.metricName || 'Custom',
          targetResource: alert.properties?.targetResource || '',
          firedAt: alert.properties?.firedAt instanceof Date
            ? alert.properties.firedAt.toISOString()
            : alert.properties?.firedAt || null,
          description: alert.properties?.description || ''
        });
      }
    }
  } catch (err) {
    console.warn(`[MONITORING] Alert query failed: ${err.message}`);
  }

  return alerts;
}

/**
 * Get secure score — returns demo value when in demo mode.
 */
async function getSecurityScore(tenantId, subscriptionId) {
  const db = await getDatabase();
  const sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);

  if (clients.isDemo) {
    const scoreMap = {
      'sub-healthcare-prod': 92,
      'sub-university-prod': 82,
      'sub-corporate-it': 78,
      'sub-dev-test': 65,
    };
    return { score: scoreMap[sub.id] || 80, max: 100 };
  }

  // Real Defender call would go here
  return { score: null, max: 100 };
}

module.exports = {
  getResourceMetrics,
  getCostConsumption,
  getBackupHealth,
  getActiveAlerts,
  getSecurityScore,
};
