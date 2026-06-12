// ============================================================
// Incident Management Service
// Handles incident flows and logs actions to audit logs
// ============================================================

const { getDatabase } = require('../db/database');
const { createNotification } = require('./notificationService');

/**
 * Get all incidents for a tenant's subscriptions
 */
async function getIncidents(tenantId, statusFilter) {
  const db = await getDatabase();
  
  let query = `
    SELECT i.*, s.name as subscription_name, r.name as resource_name, r.type as resource_type
    FROM incidents i
    JOIN azure_subscriptions s ON i.subscription_id = s.id
    LEFT JOIN resources r ON i.resource_id = r.id
    WHERE s.tenant_id = ?
  `;
  const params = [tenantId];

  if (statusFilter) {
    query += ` AND i.status = ?`;
    params.push(statusFilter.toUpperCase());
  }

  query += ` ORDER BY i.created_at DESC`;

  return db.all(query, params);
}

/**
 * Trigger/Create a new incident (often called by automated discovery or alerts monitoring)
 */
async function createIncident(tenantId, subscriptionId, resourceId, title, severity, category, description) {
  const db = await getDatabase();
  const id = `inc-${Math.random().toString(36).substring(2, 11)}`;

  await db.run(`
    INSERT INTO incidents (id, subscription_id, resource_id, title, severity, status, category, description)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `, [id, subscriptionId, resourceId, title, severity.toUpperCase(), category, description]);

  // Push notification automatically
  const notifMsg = `[${severity}] New incident triggered on resource: ${title}`;
  await createNotification(tenantId, `Incident Triggered`, notifMsg, 'incident');

  return { id, title, severity, status: 'ACTIVE', category, description };
}

/**
 * Acknowledge an incident
 */
async function acknowledgeIncident(tenantId, incidentId, userEmail, userId) {
  const db = await getDatabase();
  
  // Verify incident belongs to tenant
  const incident = await db.get(`
    SELECT i.* FROM incidents i
    JOIN azure_subscriptions s ON i.subscription_id = s.id
    WHERE s.tenant_id = ? AND i.id = ?
  `, [tenantId, incidentId]);

  if (!incident) {
    throw new Error('Incident not found or access denied.');
  }

  await db.run(
    "UPDATE incidents SET status = 'ACKNOWLEDGED' WHERE id = ?",
    [incidentId]
  );

  // Write Audit Log
  await db.run(`
    INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
    VALUES (?, ?, ?, 'ACKNOWLEDGE_INCIDENT', 'Incident', ?, ?)
  `, [tenantId, userId, userEmail, incidentId, JSON.stringify({ title: incident.title })]);

  return { success: true, status: 'ACKNOWLEDGED' };
}

/**
 * Resolve an incident
 */
async function resolveIncident(tenantId, incidentId, userEmail, userId) {
  const db = await getDatabase();
  
  // Verify incident belongs to tenant
  const incident = await db.get(`
    SELECT i.* FROM incidents i
    JOIN azure_subscriptions s ON i.subscription_id = s.id
    WHERE s.tenant_id = ? AND i.id = ?
  `, [tenantId, incidentId]);

  if (!incident) {
    throw new Error('Incident not found or access denied.');
  }

  await db.run(
    "UPDATE incidents SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?",
    [incidentId]
  );

  // Write Audit Log
  await db.run(`
    INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
    VALUES (?, ?, ?, 'RESOLVE_INCIDENT', 'Incident', ?, ?)
  `, [tenantId, userId, userEmail, incidentId, JSON.stringify({ title: incident.title })]);

  return { success: true, status: 'RESOLVED' };
}

module.exports = {
  getIncidents,
  createIncident,
  acknowledgeIncident,
  resolveIncident
};
