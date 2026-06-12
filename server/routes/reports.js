// ============================================================
// Operational Reporting API Router
// Aggregates statistics for CSV/PDF frontend compilation
// ============================================================

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { getCostConsumption, getBackupHealth, getSecurityScore } = require('../services/monitoringService');

// 1. GET /api/reports/executive - Retrieve executive summary report payload
router.get('/executive', async (req, res) => {
  const { environment } = req.query;

  try {
    const db = await getDatabase();

    // Fetch subscriptions
    let subsQuery = 'SELECT id, name, subscription_id FROM azure_subscriptions WHERE tenant_id = ?';
    const params = [req.tenantId];

    if (environment === 'Healthcare') {
      subsQuery += ' AND id = "sub-healthcare-prod"';
    } else if (environment === 'University') {
      subsQuery += ' AND id = "sub-university-prod"';
    }

    const subs = await db.all(subsQuery, params);

    if (subs.length === 0) {
      return res.json({
        generatedAt: new Date().toISOString(),
        subscriptionsCount: 0,
        resourcesCount: 0,
        incidentsCount: 0,
        totalBudget: 0,
        totalSpend: 0,
        averageSecurityScore: 100,
        averageBackupHealth: 100,
        data: []
      });
    }

    const reportData = [];
    let totalSpend = 0;
    let totalBudget = 0;
    let totalResources = 0;
    let totalIncidents = 0;
    let securitySum = 0;
    let backupSum = 0;

    for (const sub of subs) {
      // Get resource counts (filtered by environment if not 'All')
      let resCountQuery = 'SELECT COUNT(*) as count FROM resources WHERE subscription_id = ?';
      const resParams = [sub.id];
      if (environment && environment !== 'All') {
        resCountQuery += ' AND (tags LIKE ? OR tags LIKE ?)';
        resParams.push(`%"Environment":"${environment}"%`, `%"environment":"${environment}"%`);
      }
      const resCountRecord = await db.get(resCountQuery, resParams);
      const resourceCount = resCountRecord ? resCountRecord.count : 0;
      totalResources += resourceCount;

      // Get incident counts
      const incCountRecord = await db.get(`
        SELECT COUNT(*) as count FROM incidents 
        WHERE subscription_id = ? AND status != 'RESOLVED'
      `, [sub.id]);
      const activeIncidents = incCountRecord ? incCountRecord.count : 0;
      totalIncidents += activeIncidents;

      // Get cost summaries
      let costData = { currentSpend: 0, budget: 0 };
      try {
        costData = await getCostConsumption(req.tenantId, sub.id);
      } catch (err) {
        console.warn(`Could not load costs for report on sub ${sub.id}`);
      }
      totalSpend += costData.currentSpend;
      totalBudget += costData.budget;

      // Get security details (make dynamic for industries)
      let securityScoreVal = sub.id === 'sub-healthcare-prod' ? 92 : sub.id === 'sub-university-prod' ? 82 : 88;
      let backupHealthVal = sub.id === 'sub-healthcare-prod' ? 100 : 90;

      securitySum += securityScoreVal;
      backupSum += backupHealthVal;

      reportData.push({
        subscriptionId: sub.subscription_id,
        subscriptionName: sub.name,
        resourceCount,
        activeIncidents,
        currentSpend: costData.currentSpend,
        budget: costData.budget,
        securityScore: securityScoreVal,
        backupHealth: backupHealthVal
      });
    }

    res.json({
      generatedAt: new Date().toISOString(),
      subscriptionsCount: subs.length,
      resourcesCount: totalResources,
      incidentsCount: totalIncidents,
      totalBudget: Math.round(totalBudget * 100) / 100,
      totalSpend: Math.round(totalSpend * 100) / 100,
      averageSecurityScore: Math.round(securitySum / subs.length),
      averageBackupHealth: Math.round(backupSum / subs.length),
      data: reportData
    });
  } catch (error) {
    console.error('[ROUTES] GET /reports/executive failed:', error);
    res.status(500).json({ error: 'Failed to generate executive report dataset.' });
  }
});

module.exports = router;
