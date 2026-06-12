// ============================================================
// Compliance Audit Logs API Router
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');

// 1. GET /api/audit - Get all audit logs for the tenant
router.get('/', async (req, res) => {
  try {
    const db = await getDatabase();
    
    const logs = await db.all(
      'SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200',
      [req.tenantId]
    );

    const parsedLogs = logs.map(log => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : {}
    }));

    res.json(parsedLogs);
  } catch (error) {
    console.error('[ROUTES] GET /audit failed:', error);
    res.status(500).json({ error: 'Failed to retrieve compliance audit logs.' });
  }
});

module.exports = router;
