// ============================================================
// Discovered Resources API Router
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { listResourceGroupsWithCounts } = require('../services/discoveryEngine');

// 1. GET /api/resources - Retrieve cached discovered resources across tenant subscriptions
router.get('/', async (req, res) => {
  const { subscriptionId, resourceGroup, type, location } = req.query;

  try {
    const db = await getDatabase();

    // Query filters resources by checking if they belong to subscriptions registered to the user's tenant
    let query = `
      SELECT r.*, s.name as subscription_name, s.subscription_id as azure_subscription_id
      FROM resources r
      JOIN azure_subscriptions s ON r.subscription_id = s.id
      WHERE s.tenant_id = ?
    `;
    const params = [req.tenantId];

    if (subscriptionId) {
      query += ` AND r.subscription_id = ?`;
      params.push(subscriptionId);
    }
    if (resourceGroup) {
      query += ` AND r.resource_group = ?`;
      params.push(resourceGroup);
    }
    if (type) {
      query += ` AND r.type = ?`;
      params.push(type);
    }
    if (location) {
      query += ` AND r.location = ?`;
      params.push(location);
    }

    // Sort by name
    query += ` ORDER BY r.name ASC`;

    const resources = await db.all(query, params);

    // Parse JSON fields before sending response
    const formattedResources = resources.map(res => ({
      ...res,
      tags: res.tags ? JSON.parse(res.tags) : {},
      raw_payload: res.raw_payload ? JSON.parse(res.raw_payload) : {},
      owner: res.owner || 'Unassigned',
      last_modified: res.last_modified || res.last_discovered_at,
      cost_impact: res.cost_impact || 0,
      risk_score: res.risk_score || 0,
      health_status: res.health_status || 'Healthy'
    }));

    res.json(formattedResources);
  } catch (error) {
    console.error('[ROUTES] GET /resources failed:', error);
    res.status(500).json({ error: 'Failed to retrieve discovered resources.' });
  }
});

// 2. GET /api/resources/summary - Aggregated summary stats of resource types and locations
router.get('/summary', async (req, res) => {
  try {
    const db = await getDatabase();

    const resources = await db.all(`
      SELECT r.type, r.location, r.status
      FROM resources r
      JOIN azure_subscriptions s ON r.subscription_id = s.id
      WHERE s.tenant_id = ?
    `, [req.tenantId]);

    const stats = {
      totalCount: resources.length,
      byType: {},
      byLocation: {},
      byStatus: {}
    };

    resources.forEach(r => {
      // Type breakdown
      stats.byType[r.type] = (stats.byType[r.type] || 0) + 1;
      
      // Location breakdown
      stats.byLocation[r.location] = (stats.byLocation[r.location] || 0) + 1;
      
      // Status breakdown
      stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
    });

    res.json(stats);
  } catch (error) {
    console.error('[ROUTES] GET /resources/summary failed:', error);
    res.status(500).json({ error: 'Failed to retrieve resource summary stats.' });
  }
});

// 3. GET /api/resources/groups/:subscriptionId - Get live Resource Groups with cached resource counts
router.get('/groups/:subscriptionId', async (req, res) => {
  const { subscriptionId } = req.params;
  try {
    const groups = await listResourceGroupsWithCounts(req.tenantId, subscriptionId);
    res.json(groups);
  } catch (error) {
    console.error(`[ROUTES] GET /resources/groups/${subscriptionId} failed:`, error);
    res.status(500).json({ error: error.message || 'Failed to retrieve resource groups.' });
  }
});

module.exports = router;
