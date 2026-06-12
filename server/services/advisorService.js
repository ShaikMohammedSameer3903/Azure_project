// ============================================================
// Azure Advisor Service — LIVE API ONLY
// Real Azure Advisor recommendations by category
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
 * Fetch all Azure Advisor recommendations for a subscription.
 * Categories: Cost, Security, Reliability, OperationalExcellence, Performance
 */
async function getAdvisorRecommendations(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);

  if (clients.isDemo) {
    const isHealthcare = sub.id === 'sub-healthcare-prod';
    const isUniversity = sub.id === 'sub-university-prod';
    return [
      { id: `adv-${sub.id}-001`, name: 'RightSizeVM', category: 'Cost', impact: 'Medium', impactedField: 'Microsoft.Compute/virtualMachines', impactedValue: isHealthcare ? 'vm-hc-prod-web' : 'vm-corp-ad-01', resourceId: `/subscriptions/${sub.subscription_id}`, shortDescription: 'Right-size or shut down underutilized virtual machines', potentialBenefits: 'Estimated 30% cost reduction', lastUpdated: new Date().toISOString() },
      { id: `adv-${sub.id}-002`, name: 'EnableDiagnostics', category: 'OperationalExcellence', impact: 'High', impactedField: 'Microsoft.Insights/components', impactedValue: isHealthcare ? 'ai-hc-prod-telemetry' : 'ai-univ-prod-telemetry', resourceId: `/subscriptions/${sub.subscription_id}`, shortDescription: 'Enable diagnostic settings for all resources', potentialBenefits: 'Improved observability and faster incident response', lastUpdated: new Date().toISOString() },
      ...(isHealthcare ? [{ id: 'adv-hc-003', name: 'EnablePrivateEndpoints', category: 'Security', impact: 'High', impactedField: 'Microsoft.KeyVault/vaults', impactedValue: 'kv-hc-prod-secrets', resourceId: `/subscriptions/${sub.subscription_id}`, shortDescription: 'Use Private Endpoints to secure Key Vault access', potentialBenefits: 'Eliminates public network exposure for PHI secrets', lastUpdated: new Date().toISOString() }] : []),
      ...(isUniversity ? [{ id: 'adv-univ-003', name: 'EnableVersioning', category: 'Reliability', impact: 'Medium', impactedField: 'Microsoft.Storage/storageAccounts', impactedValue: 'saunivrecords', resourceId: `/subscriptions/${sub.subscription_id}`, shortDescription: 'Enable blob versioning for student records', potentialBenefits: 'Protects against accidental deletion of academic records', lastUpdated: new Date().toISOString() }] : []),
    ];
  }

  const realSubId = sub.subscription_id;
  const token = await getAccessToken(
    clients.credential,
    'https://management.azure.com/.default'
  );

  const response = await axios.get(
    `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Advisor/recommendations?api-version=2020-01-01`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const items = response.data.value || [];

  return items.map(r => ({
    id: r.id,
    name: r.name,
    category: r.properties?.category || 'General',
    impact: r.properties?.impact || 'Medium',
    impactedField: r.properties?.impactedField || '',
    impactedValue: r.properties?.impactedValue || '',
    resourceId: r.id,
    shortDescription: r.properties?.shortDescription?.solution || '',
    extendedProperties: r.properties?.extendedProperties || {},
    potentialBenefits: r.properties?.potentialBenefits || '',
    lastUpdated: r.properties?.lastUpdated || null,
    suppressionIds: r.properties?.suppressionIds || []
  }));
}

/**
 * Get Advisor score for all categories.
 */
async function getAdvisorScore(tenantId, subscriptionId) {
  const sub = await getSubscription(tenantId, subscriptionId);
  if (!sub) throw new Error('Subscription not found');

  const clients = await getAzureClients(tenantId, sub.id);

  if (clients.isDemo) {
    const scoreMap = { 'sub-healthcare-prod': 87, 'sub-university-prod': 74, 'sub-corporate-it': 70, 'sub-dev-test': 55 };
    const overall = scoreMap[sub.id] || 75;
    return [{ id: `advisor-score-${sub.id}`, name: 'overallScore', score: overall, categoryScores: [
      { name: 'Cost', score: overall - 5 },
      { name: 'Security', score: overall + 2 },
      { name: 'Reliability', score: overall - 2 },
      { name: 'OperationalExcellence', score: overall - 8 },
      { name: 'Performance', score: overall + 4 },
    ]}];
  }

  const realSubId = sub.subscription_id;
  try {
    const token = await getAccessToken(
      clients.credential,
      'https://management.azure.com/.default'
    );

    const response = await axios.get(
      `https://management.azure.com/subscriptions/${realSubId}/providers/Microsoft.Advisor/advisorScore?api-version=2023-01-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const items = response.data.value || [];
    return items.map(s => ({
      id: s.id,
      name: s.name,
      score: s.properties?.score?.current ?? null,
      categoryScores: (s.properties?.categoryScores || []).map(c => ({
        name: c.name,
        score: c.score?.current ?? null
      }))
    }));
  } catch (err) {
    console.warn('[ADVISOR] Score API not available:', err.message);
    return [];
  }
}

module.exports = {
  getAdvisorRecommendations,
  getAdvisorScore
};
