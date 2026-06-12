// ============================================================
// Resource Management Actions API Router
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { authorizeRoles } = require('../middleware/rbac');
const { executeVmAction, createResourceGroup, createStorageAccount, deployVirtualMachine } = require('../services/actionService');

// Helper to verify subscription ownership
async function verifySubscription(tenantId, subId) {
  const db = await getDatabase();
  const sub = await db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)', 
    [tenantId, subId, subId]
  );
  return sub;
}

// 1. POST /api/actions/vm - VM power cycles (Start, Stop, Restart)
// Requires OWNER, ADMIN, or OPERATOR role
router.post('/vm', authorizeRoles('OWNER', 'ADMIN', 'OPERATOR'), async (req, res) => {
  const { subscriptionId, resourceId, action } = req.body;

  if (!subscriptionId || !resourceId || !action) {
    return res.status(400).json({ error: 'subscriptionId, resourceId, and action ("start", "stop", "restart") are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, subscriptionId);
    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found or access denied.' });
    }

    const result = await executeVmAction(req.tenantId, sub.id, resourceId, action.toLowerCase(), req.userEmail, req.userId);
    res.json(result);
  } catch (error) {
    console.error(`[ROUTES] VM action ${action} failed:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 2. POST /api/actions/resource-group - Create a Resource Group
// Requires OWNER or ADMIN role
router.post('/resource-group', authorizeRoles('OWNER', 'ADMIN'), async (req, res) => {
  const { subscriptionId, name, location } = req.body;

  if (!subscriptionId || !name || !location) {
    return res.status(400).json({ error: 'subscriptionId, name, and location are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, subscriptionId);
    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found or access denied.' });
    }

    const result = await createResourceGroup(req.tenantId, sub.id, name, location, req.userEmail, req.userId);
    res.status(201).json(result);
  } catch (error) {
    console.error(`[ROUTES] Resource Group creation failed:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 3. POST /api/actions/storage-account - Create a Storage Account
// Requires OWNER or ADMIN role
router.post('/storage-account', authorizeRoles('OWNER', 'ADMIN'), async (req, res) => {
  const { subscriptionId, name, resourceGroup, location } = req.body;

  if (!subscriptionId || !name || !resourceGroup || !location) {
    return res.status(400).json({ error: 'subscriptionId, name, resourceGroup, and location are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, subscriptionId);
    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found or access denied.' });
    }

    const result = await createStorageAccount(req.tenantId, sub.id, name, resourceGroup, location, req.userEmail, req.userId);
    res.status(201).json(result);
  } catch (error) {
    console.error(`[ROUTES] Storage Account creation failed:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 4. POST /api/actions/deploy-vm - Deploy a new VM
// Requires OWNER, ADMIN, or OPERATOR role
router.post('/deploy-vm', authorizeRoles('OWNER', 'ADMIN', 'OPERATOR'), async (req, res) => {
  const { subscriptionId, name, resourceGroup, location, size, os } = req.body;

  if (!subscriptionId || !name || !resourceGroup || !location || !size || !os) {
    return res.status(400).json({ error: 'subscriptionId, name, resourceGroup, location, size, and os are required.' });
  }

  try {
    const sub = await verifySubscription(req.tenantId, subscriptionId);
    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found or access denied.' });
    }

    const result = await deployVirtualMachine(
      req.tenantId, 
      sub.id, 
      name, 
      resourceGroup, 
      location, 
      size, 
      os, 
      req.userEmail, 
      req.userId
    );
    res.status(201).json(result);
  } catch (error) {
    console.error(`[ROUTES] VM deployment failed:`, error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
