// ============================================================
// Resource Discovery Engine — LIVE Azure API ONLY
// No demo mode — only real Azure SDK discovery
// ============================================================

const { getDatabase } = require('../db/database');
const { getAzureClients } = require('./azureCredentialManager');

/**
 * Discover and cache all resources under a specific subscription.
 * Uses real Azure SDK — no demo simulation.
 */
async function discoverAllResources(tenantId, subscriptionId) {
  const db = await getDatabase();
  const sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
  if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

  const clients = await getAzureClients(tenantId, sub.id);
  const resourceClient = clients.resourceClient;
  const discoveredList = [];

  await db.run('BEGIN TRANSACTION');

  const discoveredIds = [];

  try {
    const pager = resourceClient.resources.list();

    for await (const resource of pager) {
      const resourceId = resource.id;
      const parsedType = resource.type;
      const name = resource.name;
      const location = resource.location || 'global';
      const tags = resource.tags ? JSON.stringify(resource.tags) : '{}';

      const rgMatch = resourceId.match(/\/resourceGroups\/([^/]+)/i);
      const resourceGroup = rgMatch ? rgMatch[1] : 'Unknown';

      let status = 'Active';
      let rawPayload = {
        sku: resource.sku,
        plan: resource.plan,
        kind: resource.kind
      };

      if (resource.properties) {
        if (resource.properties.provisioningState) {
          status = resource.properties.provisioningState;
        }
        rawPayload = { ...rawPayload, ...resource.properties };
      }

      // Enriched metadata
      const owner = resource.tags?.Owner || resource.tags?.owner || 'Unassigned';
      const lastModified = resource.properties?.lastModifiedDate || new Date().toISOString();
      
      // Calculate a dynamic risk score for this specific resource based on tag compliance and type
      let riskScore = 0;
      if (!resource.tags || Object.keys(resource.tags).length === 0) {
        riskScore += 25; // No tags
      } else {
        if (!resource.tags.Environment && !resource.tags.environment) riskScore += 10;
        if (!resource.tags.Owner && !resource.tags.owner) riskScore += 10;
        if (!resource.tags.CostCenter && !resource.tags.costcenter) riskScore += 5;
      }
      
      // Type-specific baseline risks
      if (parsedType.toLowerCase().includes('virtualmachines') && status !== 'Running') {
        riskScore += 15; // Stopped VM
      }
      if (parsedType.toLowerCase().includes('storageaccounts') && rawPayload.allowBlobPublicAccess === true) {
        riskScore += 30; // Public Storage Account
      }
      if (parsedType.toLowerCase().includes('keyvault/vaults') && rawPayload.enableSoftDelete !== true) {
        riskScore += 20; // Soft delete disabled
      }
      riskScore = Math.min(100, riskScore);

      // Determine basic health status
      let healthStatus = 'Healthy';
      if (riskScore >= 50) {
        healthStatus = 'Critical';
      } else if (riskScore >= 20) {
        healthStatus = 'Warning';
      }

      // Estimated cost impact (placeholder calculation from SKU or defaults)
      let costImpact = 0;
      if (resource.sku?.name) {
        const skuLower = resource.sku.name.toLowerCase();
        if (skuLower.includes('premium') || skuLower.includes('p3') || skuLower.includes('d4')) costImpact = 150;
        else if (skuLower.includes('standard') || skuLower.includes('s1') || skuLower.includes('d2')) costImpact = 50;
        else costImpact = 10;
      } else {
        costImpact = parsedType.toLowerCase().includes('virtualmachines') ? 80 : 15;
      }

      await db.run(`
        INSERT INTO resources (
          id, subscription_id, resource_group, name, type, location, status, tags, raw_payload, 
          owner, last_modified, cost_impact, risk_score, health_status, last_discovered_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          status = excluded.status,
          tags = excluded.tags,
          raw_payload = excluded.raw_payload,
          owner = excluded.owner,
          last_modified = excluded.last_modified,
          cost_impact = excluded.cost_impact,
          risk_score = excluded.risk_score,
          health_status = excluded.health_status,
          last_discovered_at = CURRENT_TIMESTAMP
      `, [
        resourceId,
        sub.id,
        resourceGroup,
        name,
        parsedType,
        location,
        status,
        tags,
        JSON.stringify(rawPayload),
        owner,
        lastModified,
        costImpact,
        riskScore,
        healthStatus
      ]);

      discoveredIds.push(resourceId);
      discoveredList.push({
        id: resourceId,
        subscription_id: sub.id,
        resource_group: resourceGroup,
        name,
        type: parsedType,
        location,
        status,
        tags: resource.tags || {},
        raw_payload: rawPayload,
        owner,
        last_modified: lastModified,
        cost_impact: costImpact,
        risk_score: riskScore,
        health_status: healthStatus
      });
    }

    // Remove stale resources no longer in Azure
    if (discoveredIds.length > 0) {
      const placeholders = discoveredIds.map(() => '?').join(',');
      await db.run(`
        DELETE FROM resources
        WHERE subscription_id = ? AND id NOT IN (${placeholders})
      `, [sub.id, ...discoveredIds]);
    } else {
      await db.run('DELETE FROM resources WHERE subscription_id = ?', [sub.id]);
    }

    await db.run('COMMIT');

    // Write audit log
    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, 'system', 'discovery-engine@cloudops.internal', 'DISCOVER_RESOURCES', 'AzureSubscription', ?, ?)
    `, [tenantId, sub.id, JSON.stringify({ count: discoveredList.length })]);

    return discoveredList;
  } catch (error) {
    await db.run('ROLLBACK');
    console.error(`[DISCOVERY] Failed for subscription ${subscriptionId}:`, error);
    throw error;
  }
}


/**
 * Discover resources filtered by a specific Resource Group.
 */
async function discoverResourcesByGroup(tenantId, subscriptionId, resourceGroup) {
  const db = await getDatabase();
  const sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
  if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

  const clients = await getAzureClients(tenantId, sub.id);
  const resourceClient = clients.resourceClient;

  const resources = [];
  const pager = resourceClient.resources.listByResourceGroup(resourceGroup);

  for await (const resource of pager) {
    const rgMatch = resource.id.match(/\/resourceGroups\/([^/]+)/i);
    const rg = rgMatch ? rgMatch[1] : resourceGroup;

    let status = 'Active';
    let rawPayload = { sku: resource.sku, plan: resource.plan, kind: resource.kind };
    if (resource.properties?.provisioningState) {
      status = resource.properties.provisioningState;
      rawPayload = { ...rawPayload, ...resource.properties };
    }

    resources.push({
      id: resource.id,
      subscription_id: sub.id,
      resource_group: rg,
      name: resource.name,
      type: resource.type,
      location: resource.location || 'global',
      status,
      tags: resource.tags || {},
      raw_payload: rawPayload
    });
  }

  return resources;
}

/**
 * List all Resource Groups for a subscription with resource counts.
 */
async function listResourceGroupsWithCounts(tenantId, subscriptionId) {
  const db = await getDatabase();
  const sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
  if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

  const clients = await getAzureClients(tenantId, sub.id);
  const resourceClient = clients.resourceClient;

  const groups = [];
  const pager = resourceClient.resourceGroups.list();

  for await (const rg of pager) {
    groups.push({
      id: rg.id,
      name: rg.name,
      location: rg.location,
      provisioningState: rg.properties?.provisioningState || 'Succeeded',
      tags: rg.tags || {}
    });
  }

  // Get resource counts per group from DB (fast — avoids extra API calls)
  const counts = await db.all(
    'SELECT resource_group, COUNT(*) as count FROM resources WHERE subscription_id = ? GROUP BY resource_group',
    [sub.id]
  );
  const countMap = {};
  counts.forEach(c => { countMap[c.resource_group] = c.count; });

  return groups.map(rg => ({
    ...rg,
    resourceCount: countMap[rg.name] || 0
  }));
}

module.exports = {
  discoverAllResources,
  discoverResourcesByGroup,
  listResourceGroupsWithCounts
};
