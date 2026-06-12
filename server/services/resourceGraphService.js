// ============================================================
// Azure Resource Graph Service — Advanced cross-subscription queries
// Uses Azure Resource Graph REST API for enriched resource metadata
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
 * Execute an Azure Resource Graph query.
 */
async function executeResourceGraphQuery(tenantId, subscriptionId, query) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  const response = await axios.post(
    'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01',
    {
      subscriptions: [sub.subscription_id],
      query,
      options: { resultFormat: 'objectArray' }
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  return response.data.data || [];
}

/**
 * Get all resources with enriched metadata (owner, tags, changes).
 */
async function getEnrichedResources(tenantId, subscriptionId) {
  const query = `
    Resources
    | project id, name, type, resourceGroup, location, 
              subscriptionId, tags, properties,
              kind, sku, plan, identity,
              provisioningState = properties.provisioningState,
              createdTime = properties.creationTime,
              changedTime = properties.lastModifiedDate
    | order by type asc, name asc
  `;

  try {
    return await executeResourceGraphQuery(tenantId, subscriptionId, query);
  } catch (err) {
    console.warn('[RESOURCE_GRAPH] Enriched resources query failed:', err.message);
    return [];
  }
}

/**
 * Detect resources missing required tags.
 */
async function findResourcesMissingTags(tenantId, subscriptionId, requiredTags = ['Environment', 'Owner', 'CostCenter']) {
  const tagChecks = requiredTags.map(t => `isnull(tags['${t}'], '') == ''`).join(' or ');
  const query = `
    Resources
    | where ${tagChecks}
    | project id, name, type, resourceGroup, location, tags
    | order by type asc
  `;

  try {
    return await executeResourceGraphQuery(tenantId, subscriptionId, query);
  } catch (err) {
    console.warn('[RESOURCE_GRAPH] Missing tags query failed:', err.message);
    return [];
  }
}

/**
 * Find publicly exposed resources (public IPs, public storage, etc.).
 */
async function findPubliclyExposedResources(tenantId, subscriptionId) {
  const query = `
    Resources
    | where type =~ 'microsoft.network/publicipaddresses'
       or (type =~ 'microsoft.storage/storageaccounts' and properties.allowBlobPublicAccess == true)
       or (type =~ 'microsoft.web/sites' and properties.httpsOnly == false)
       or (type =~ 'microsoft.sql/servers' and properties.publicNetworkAccess == 'Enabled')
    | project id, name, type, resourceGroup, location, 
              publicExposure = case(
                type =~ 'microsoft.network/publicipaddresses', 'Public IP Address',
                type =~ 'microsoft.storage/storageaccounts', 'Public Blob Access',
                type =~ 'microsoft.web/sites', 'HTTP Allowed (No HTTPS)',
                type =~ 'microsoft.sql/servers', 'Public Network Access',
                'Unknown'
              ),
              properties
    | order by type asc
  `;

  try {
    return await executeResourceGraphQuery(tenantId, subscriptionId, query);
  } catch (err) {
    console.warn('[RESOURCE_GRAPH] Public exposure query failed:', err.message);
    return [];
  }
}

/**
 * Find unused/orphaned resources.
 */
async function findUnusedResources(tenantId, subscriptionId) {
  const query = `
    Resources
    | where (type =~ 'microsoft.compute/disks' and properties.diskState == 'Unattached')
       or (type =~ 'microsoft.network/networkinterfaces' and isnull(properties.virtualMachine))
       or (type =~ 'microsoft.network/publicipaddresses' and isnull(properties.ipConfiguration))
       or (type =~ 'microsoft.network/networksecuritygroups' and array_length(properties.networkInterfaces) == 0 and array_length(properties.subnets) == 0)
    | project id, name, type, resourceGroup, location,
              unusedReason = case(
                type =~ 'microsoft.compute/disks', 'Unattached Disk',
                type =~ 'microsoft.network/networkinterfaces', 'Orphaned NIC',
                type =~ 'microsoft.network/publicipaddresses', 'Unassociated Public IP',
                type =~ 'microsoft.network/networksecuritygroups', 'NSG Not Attached',
                'Unused Resource'
              ),
              sku, properties
    | order by type asc
  `;

  try {
    return await executeResourceGraphQuery(tenantId, subscriptionId, query);
  } catch (err) {
    console.warn('[RESOURCE_GRAPH] Unused resources query failed:', err.message);
    return [];
  }
}

/**
 * Detect recent resource changes (last 24 hours) via Resource Graph Changes.
 */
async function getRecentResourceChanges(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    const response = await axios.post(
      'https://management.azure.com/providers/Microsoft.ResourceGraph/resourceChanges?api-version=2018-09-01-preview',
      {
        subscriptions: [sub.subscription_id],
        interval: {
          start: yesterday.toISOString(),
          end: now.toISOString()
        },
        top: 100
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const changes = (response.data.changes || []).map(c => ({
      resourceId: c.resourceId,
      changeType: c.changeType,
      timestamp: c.afterSnapshot?.timestamp || c.beforeSnapshot?.timestamp || null,
      changedProperties: c.propertyChanges?.map(p => p.propertyName) || []
    }));

    return changes;
  } catch (err) {
    console.warn('[RESOURCE_GRAPH] Resource changes query failed:', err.message);
    return [];
  }
}

/**
 * Get resource type distribution summary.
 */
async function getResourceTypeSummary(tenantId, subscriptionId) {
  const query = `
    Resources
    | summarize count() by type
    | order by count_ desc
    | project resourceType = type, count = count_
  `;

  try {
    return await executeResourceGraphQuery(tenantId, subscriptionId, query);
  } catch (err) {
    console.warn('[RESOURCE_GRAPH] Resource type summary failed:', err.message);
    return [];
  }
}

/**
 * Get resources by region distribution.
 */
async function getResourcesByRegion(tenantId, subscriptionId) {
  const query = `
    Resources
    | summarize count() by location
    | order by count_ desc
    | project region = location, count = count_
  `;

  try {
    return await executeResourceGraphQuery(tenantId, subscriptionId, query);
  } catch (err) {
    console.warn('[RESOURCE_GRAPH] Resources by region failed:', err.message);
    return [];
  }
}

/**
 * Check resources missing diagnostics settings.
 */
async function findResourcesMissingDiagnostics(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);
  const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

  // Get all resources that should have diagnostics
  const monitorableTypes = [
    'microsoft.compute/virtualmachines',
    'microsoft.web/sites',
    'microsoft.sql/servers/databases',
    'microsoft.keyvault/vaults',
    'microsoft.storage/storageaccounts',
    'microsoft.network/loadbalancers',
    'microsoft.containerservice/managedclusters'
  ];

  const typeFilter = monitorableTypes.map(t => `type =~ '${t}'`).join(' or ');
  const query = `
    Resources
    | where ${typeFilter}
    | project id, name, type, resourceGroup, location
  `;

  try {
    const resources = await executeResourceGraphQuery(tenantId, subscriptionId, query);
    const missingDiag = [];

    for (const resource of resources.slice(0, 50)) {
      try {
        const diagResp = await axios.get(
          `https://management.azure.com${resource.id}/providers/Microsoft.Insights/diagnosticSettings?api-version=2021-05-01-preview`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const settings = diagResp.data.value || [];
        if (settings.length === 0) {
          missingDiag.push({
            ...resource,
            issue: 'No diagnostic settings configured'
          });
        }
      } catch (_) {
        // Skip resources where diagnostics check fails
      }
    }

    return missingDiag;
  } catch (err) {
    console.warn('[RESOURCE_GRAPH] Missing diagnostics check failed:', err.message);
    return [];
  }
}

module.exports = {
  executeResourceGraphQuery,
  getEnrichedResources,
  findResourcesMissingTags,
  findPubliclyExposedResources,
  findUnusedResources,
  getRecentResourceChanges,
  getResourceTypeSummary,
  getResourcesByRegion,
  findResourcesMissingDiagnostics
};
