// ============================================================
// Azure Service Health Service — LIVE API ONLY
// Active outages, planned maintenance, health advisories
// ============================================================

const { getAzureClients } = require('./azureCredentialManager');
const { getDatabase } = require('../db/database');
const axios = require('axios');

async function getSubscription(tenantId, subscriptionId) {
  const db = await getDatabase();
  return db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
}

async function getAccessToken(credential, scope) {
  const tokenResponse = await credential.getToken(scope);
  return tokenResponse.token;
}

/**
 * Get active Service Health events (outages, maintenance, advisories).
 */
async function getServiceHealthAlerts(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);

  if (clients.isDemo) {
    const isHealthcare = sub.id === 'sub-healthcare-prod';
    const isUniversity = sub.id === 'sub-university-prod';
    const alerts = [];
    if (isHealthcare) {
      alerts.push({
        id: 'svc-hc-001',
        name: 'AzureSQLOutage',
        title: 'Azure SQL Service Outage',
        eventType: 'Outage',
        status: 'Active',
        level: 'Critical',
        description: 'Partial outage affecting SQL databases in East US.',
        impactedServices: [{ serviceName: 'AzureSQL', regions: ['East US'] }],
        startTime: new Date(Date.now() - 600000).toISOString(),
        lastUpdate: new Date().toISOString(),
        trackingId: 'track-hc-001'
      });
    } else if (isUniversity) {
      alerts.push({
        id: 'svc-univ-001',
        name: 'AzureStorageAlert',
        title: 'Storage Latency Degradation',
        eventType: 'Maintenance',
        status: 'Active',
        level: 'Warning',
        description: 'Increased latency observed for storage accounts.',
        impactedServices: [{ serviceName: 'AzureStorage', regions: ['West Europe'] }],
        startTime: new Date(Date.now() - 3600000).toISOString(),
        lastUpdate: new Date().toISOString(),
        trackingId: 'track-univ-001'
      });
    }
    return alerts;
  }

  const realSubId = sub.subscription_id;
  const token = await getAccessToken(
    clients.credential,
    'https://management.azure.com/.default'
  );

  // Query active events (not resolved)
  const response = await axios.get(
    `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.ResourceHealth/events?api-version=2022-10-01&$filter=Properties/EventType ne 'HealthAdvisory' and Properties/Status eq 'Active'`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const events = response.data.value || [];
  return events.map(e => ({
    id: e.id,
    name: e.name,
    title: e.properties?.title || e.name,
    eventType: e.properties?.eventType || 'Unknown',
    status: e.properties?.status || 'Unknown',
    level: e.properties?.level || 'Information',
    description: e.properties?.summary || e.properties?.description || '',
    impactedServices: (e.properties?.impact || []).map(i => ({
      serviceName: i.impactedService,
      regions: (i.impactedRegions || []).map(r => r.impactedRegion)
    })),
    startTime: e.properties?.impactStartTime || null,
    lastUpdate: e.properties?.lastUpdateTime || null,
    trackingId: e.properties?.trackingId || e.name
  }));
}

/**
 * Get resource-level health status.
 */
async function getResourceHealth(tenantId, subscriptionId, resourceId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);

  if (clients.isDemo) {
    const isHealthcare = sub.id === 'sub-healthcare-prod';
    return {
      resourceId,
      availabilityState: isHealthcare ? 'Available' : 'Degraded',
      title: isHealthcare ? 'Resource healthy' : 'Resource experiencing issues',
      summary: isHealthcare ? 'All systems operational.' : 'Intermittent latency detected.',
      reasonType: isHealthcare ? '' : 'PerformanceDegradation',
      occurredAt: new Date(Date.now() - 300000).toISOString(),
      reportedAt: new Date().toISOString()
    };
  }

  const token = await getAccessToken(
    clients.credential,
    'https://management.azure.com/.default'
  );

  try {
    const response = await axios.get(
      `https://management.azure.com${resourceId}/providers/Microsoft.ResourceHealth/availabilityStatuses/current?api-version=2022-10-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const props = response.data.properties;
    return {
      resourceId,
      availabilityState: props?.availabilityState || 'Unknown',
      title: props?.title || '',
      summary: props?.summary || '',
      reasonType: props?.reasonType || '',
      occurredAt: props?.occurredTime || null,
      reportedAt: props?.reportedTime || null
    };
  } catch (err) {
    return {
      resourceId,
      availabilityState: 'Unknown',
      title: 'Health status unavailable',
      summary: err.message,
      reasonType: null,
      occurredAt: null,
      reportedAt: null
    };
  }
}

/**
 * Get all planned maintenance events for a subscription.
 */
async function getPlannedMaintenance(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);

  if (clients.isDemo) {
    const isHealthcare = sub.id === 'sub-healthcare-prod';
    const isUniversity = sub.id === 'sub-university-prod';
    const events = [];
    if (isHealthcare) {
      events.push({
        id: 'maint-hc-001',
        name: 'SQLMaintenance',
        title: 'Planned Maintenance for Azure SQL',
        status: 'Scheduled',
        description: 'Maintenance window for patching Azure SQL databases.',
        impactedServices: ['AzureSQL'],
        startTime: new Date(Date.now() + 86400000).toISOString(),
        endTime: new Date(Date.now() + 90000000).toISOString()
      });
    } else if (isUniversity) {
      events.push({
        id: 'maint-univ-001',
        name: 'StorageMaintenance',
        title: 'Scheduled Storage Account Maintenance',
        status: 'Scheduled',
        description: 'Backend hardware upgrade for storage accounts.',
        impactedServices: ['AzureStorage'],
        startTime: new Date(Date.now() + 43200000).toISOString(),
        endTime: new Date(Date.now() + 54000000).toISOString()
      });
    }
    return events;
  }

  const realSubId = sub.subscription_id;
  const token = await getAccessToken(
    clients.credential,
    'https://management.azure.com/.default'
  );

  const response = await axios.get(
    `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.ResourceHealth/events?api-version=2022-10-01&$filter=Properties/EventType eq 'PlannedMaintenance'`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const events = response.data.value || [];
  return events.map(e => ({
    id: e.id,
    name: e.name,
    title: e.properties?.title || e.name,
    status: e.properties?.status || 'Unknown',
    description: e.properties?.summary || '',
    impactedServices: (e.properties?.impact || []).map(i => i.impactedService),
    startTime: e.properties?.impactStartTime || null,
    endTime: e.properties?.impactMitigationTime || null
  }));
}

module.exports = {
  getServiceHealthAlerts,
  getResourceHealth,
  getPlannedMaintenance
};
