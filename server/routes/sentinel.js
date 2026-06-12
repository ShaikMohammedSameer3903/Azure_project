// ============================================================
// Sentinel Routes — Microsoft Sentinel incidents + alerts
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { getAzureClients } = require('../services/azureCredentialManager');
const axios = require('axios');

async function verifySubscription(tenantId, subId) {
  const db = await getDatabase();
  return db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)',
    [tenantId, subId, subId]
  );
}

async function getAccessToken(credential, scope) {
  const tokenResponse = await credential.getToken(scope);
  return tokenResponse.token;
}

// ── GET /api/sentinel/workspaces ────────────────────────────
// Discover Sentinel workspaces in a subscription
router.get('/workspaces', async (req, res) => {
  const { subscriptionId } = req.query;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required.' });

  try {
    const sub = await verifySubscription(req.tenantId, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found.' });

    const clients = await getAzureClients(req.tenantId, sub.id);
    const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

    // Find Log Analytics workspaces with Sentinel solution installed
    const resp = await axios.get(
      `https://management.azure.com/subscriptions/${sub.subscription_id}/providers/Microsoft.OperationalInsights/workspaces?api-version=2022-10-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const workspaces = resp.data.value || [];
    const sentinelWorkspaces = [];

    for (const ws of workspaces) {
      const rgMatch = ws.id.match(/\/resourceGroups\/([^/]+)/i);
      const rg = rgMatch ? rgMatch[1] : '';
      try {
        // Check if Sentinel is enabled on this workspace
        const sentinelCheck = await axios.get(
          `https://management.azure.com/subscriptions/${sub.subscription_id}/resourceGroups/${rg}/providers/Microsoft.OperationsManagement/solutions/SecurityInsights(${ws.name})?api-version=2015-11-01-preview`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (sentinelCheck.status === 200) {
          sentinelWorkspaces.push({
            id: ws.id,
            name: ws.name,
            resourceGroup: rg,
            location: ws.location,
            customerId: ws.properties?.customerId || null
          });
        }
      } catch (_) {
        // Sentinel not enabled on this workspace
      }
    }

    res.json(sentinelWorkspaces);
  } catch (err) {
    console.error('[SENTINEL] GET /workspaces failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/sentinel/incidents ─────────────────────────────
// Fetch Sentinel incidents from a specific workspace
router.get('/incidents', async (req, res) => {
  const { subscriptionId, resourceGroup, workspaceName } = req.query;
  if (!subscriptionId || !resourceGroup || !workspaceName) {
    return res.status(400).json({ error: 'subscriptionId, resourceGroup, and workspaceName are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found.' });

    const clients = await getAzureClients(req.tenantId, sub.id);
    const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

    const resp = await axios.get(
      `https://management.azure.com/subscriptions/${sub.subscription_id}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${workspaceName}/providers/Microsoft.SecurityInsights/incidents?api-version=2023-02-01&$orderby=properties/createdTimeUtc desc&$top=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const incidents = (resp.data.value || []).map(i => ({
      id: i.id,
      name: i.name,
      title: i.properties?.title || i.name,
      description: i.properties?.description || '',
      severity: i.properties?.severity || 'Informational',
      status: i.properties?.status || 'New',
      classification: i.properties?.classification || null,
      classificationComment: i.properties?.classificationComment || null,
      incidentNumber: i.properties?.incidentNumber || null,
      owner: i.properties?.owner?.userPrincipalName || null,
      alertCount: i.properties?.additionalData?.alertsCount || 0,
      createdAt: i.properties?.createdTimeUtc || null,
      updatedAt: i.properties?.lastModifiedTimeUtc || null,
      firstActivityAt: i.properties?.firstActivityTimeUtc || null,
      lastActivityAt: i.properties?.lastActivityTimeUtc || null,
      labels: (i.properties?.labels || []).map(l => l.labelName)
    }));

    res.json(incidents);
  } catch (err) {
    console.error('[SENTINEL] GET /incidents failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/sentinel/alerts ────────────────────────────────
// Fetch recent Sentinel alerts
router.get('/alerts', async (req, res) => {
  const { subscriptionId, resourceGroup, workspaceName } = req.query;
  if (!subscriptionId || !resourceGroup || !workspaceName) {
    return res.status(400).json({ error: 'subscriptionId, resourceGroup, and workspaceName are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, subscriptionId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found.' });

    const clients = await getAzureClients(req.tenantId, sub.id);
    const token = await getAccessToken(clients.credential, 'https://management.azure.com/.default');

    const resp = await axios.get(
      `https://management.azure.com/subscriptions/${sub.subscription_id}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${workspaceName}/providers/Microsoft.SecurityInsights/alerts?api-version=2023-02-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const alerts = (resp.data.value || []).map(a => ({
      id: a.id,
      name: a.name,
      displayName: a.properties?.alertDisplayName || a.name,
      severity: a.properties?.severity || 'Informational',
      status: a.properties?.status || 'New',
      description: a.properties?.description || '',
      providerAlertId: a.properties?.providerAlertId || null,
      alertType: a.properties?.alertType || '',
      startTime: a.properties?.startTimeUtc || null,
      endTime: a.properties?.endTimeUtc || null,
      processingEndTime: a.properties?.processingEndTime || null,
      entities: (a.properties?.entities || []).slice(0, 5)
    }));

    res.json(alerts);
  } catch (err) {
    console.error('[SENTINEL] GET /alerts failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
