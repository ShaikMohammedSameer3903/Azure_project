// ============================================================
// Subscriptions API Router
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { authorizeRoles } = require('../middleware/rbac');
const { discoverAllResources } = require('../services/discoveryEngine');
const { clearClientCache } = require('../services/azureCredentialManager');

// 1. GET /api/subscriptions - List all subscriptions for the tenant
router.get('/', async (req, res) => {
  try {
    const db = await getDatabase();
    const subs = await db.all(
      'SELECT id, subscription_id, name, client_id, azure_tenant_id, auth_type, status, created_at FROM azure_subscriptions WHERE tenant_id = ?',
      [req.tenantId]
    );
    res.json(subs);
  } catch (error) {
    console.error('[ROUTES] GET /subscriptions failed:', error);
    res.status(500).json({ error: 'Failed to retrieve subscriptions.' });
  }
});

// 2. POST /api/subscriptions - Register a new subscription (Requires OWNER or ADMIN)
router.post('/', authorizeRoles('OWNER', 'ADMIN'), async (req, res) => {
  const { subscriptionId, name, clientId, clientSecret, azureTenantId, authType } = req.body;

  if (!subscriptionId || !name) {
    return res.status(400).json({ error: 'Subscription ID and Name are required.' });
  }

  try {
    const db = await getDatabase();

    // Check if subscription is already registered under this tenant
    const existing = await db.get(
      'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND subscription_id = ?',
      [req.tenantId, subscriptionId]
    );

    if (existing) {
      return res.status(400).json({ error: 'This subscription is already registered under your tenant.' });
    }

    const newId = `sub-${Math.random().toString(36).substring(2, 11)}`;
    const finalAuthType = authType || 'MSAL';

    await db.run(`
      INSERT INTO azure_subscriptions (id, tenant_id, subscription_id, name, client_id, client_secret, azure_tenant_id, auth_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active')
    `, [
      newId,
      req.tenantId,
      subscriptionId,
      name,
      clientId || null,
      clientSecret || null,
      azureTenantId || null,
      finalAuthType
    ]);

    // Create audit log
    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, 'REGISTER_SUBSCRIPTION', 'AzureSubscription', ?, ?)
    `, [req.tenantId, req.userId, req.userEmail, newId, JSON.stringify({ name, subscriptionId })]);

    // Async trigger initial discovery sync
    discoverAllResources(req.tenantId, newId).catch(err => 
      console.error(`[DISCOVERY] Initial sync failed for ${name}:`, err.message)
    );

    res.status(201).json({
      id: newId,
      subscription_id: subscriptionId,
      name,
      auth_type: finalAuthType,
      status: 'Active',
      message: 'Subscription registered successfully. Initial resource discovery initiated.'
    });
  } catch (error) {
    console.error('[ROUTES] POST /subscriptions failed:', error);
    res.status(500).json({ error: 'Failed to register subscription.' });
  }
});

// 3. POST /api/subscriptions/:id/sync - Trigger manual discovery sync
router.post('/:id/sync', async (req, res) => {
  const { id } = req.params;

  try {
    const db = await getDatabase();
    
    // Check ownership
    const sub = await db.get(
      'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND id = ?',
      [req.tenantId, id]
    );

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found or access denied.' });
    }

    // Update status to syncing
    await db.run('UPDATE azure_subscriptions SET status = "Syncing" WHERE id = ?', [id]);

    // Run discovery
    const discovered = await discoverAllResources(req.tenantId, id);

    // Revert status to Active
    await db.run('UPDATE azure_subscriptions SET status = "Active" WHERE id = ?', [id]);

    res.json({
      success: true,
      message: `Sync completed. Discovered ${discovered.length} resources.`,
      resourcesCount: discovered.length
    });
  } catch (error) {
    // If sync failed, restore status to Active but report error
    const db = await getDatabase();
    await db.run('UPDATE azure_subscriptions SET status = "Error" WHERE id = ?', [id]).catch(() => {});
    
    console.error(`[ROUTES] Sync failed for subscription ${id}:`, error);
    res.status(500).json({ error: `Discovery sync failed: ${error.message}` });
  }
});

// 4. DELETE /api/subscriptions/:id - Delete/unregister a subscription (Requires OWNER)
router.delete('/:id', authorizeRoles('OWNER'), async (req, res) => {
  const { id } = req.params;

  try {
    const db = await getDatabase();

    // Check ownership
    const sub = await db.get(
      'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND id = ?',
      [req.tenantId, id]
    );

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found or access denied.' });
    }

    // Cascade delete is configured on database schema for resources, incidents, budgets
    await db.run('DELETE FROM azure_subscriptions WHERE id = ?', [id]);
    
    // Clear credentials client cache
    clearClientCache(req.tenantId, id);

    // Create audit log
    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, 'DELETE_SUBSCRIPTION', 'AzureSubscription', ?, ?)
    `, [req.tenantId, req.userId, req.userEmail, id, JSON.stringify({ name: sub.name, subscriptionId: sub.subscription_id })]);

    res.json({ success: true, message: `Subscription ${sub.name} deleted successfully.` });
  } catch (error) {
    console.error('[ROUTES] DELETE /subscriptions failed:', error);
    res.status(500).json({ error: 'Failed to delete subscription.' });
  }
});

module.exports = router;
