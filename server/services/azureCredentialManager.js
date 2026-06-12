// ============================================================
// Azure Credential Manager
// Dynamically builds real Azure SDK clients for each subscription.
// When demo credentials are detected, returns a safe stub bundle.
// ============================================================

const { ClientSecretCredential, OnBehalfOfCredential } = require('@azure/identity');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { MonitorClient } = require('@azure/arm-monitor');
const { PolicyClient } = require('@azure/arm-policy');
const { RecoveryServicesBackupClient } = require('@azure/arm-recoveryservicesbackup');
const { ConsumptionManagementClient } = require('@azure/arm-consumption');
const { ComputeManagementClient } = require('@azure/arm-compute');
const { StorageManagementClient } = require('@azure/arm-storage');
const { NetworkManagementClient } = require('@azure/arm-network');
const { AuthorizationManagementClient } = require('@azure/arm-authorization');
const { KeyVaultManagementClient } = require('@azure/arm-keyvault');
const { getDatabase } = require('../db/database');

// In-memory client cache — keyed by tenantId:subscriptionId
const clientCache = new Map();

const DEMO_CLIENT_IDS = new Set(['demo-client-id', 'mock-client-id', '']);
const DEMO_CLIENT_SECRETS = new Set(['demo-client-secret', 'mock-client-secret', '']);

function isDemoCredential(sub) {
  return (
    !sub.client_id ||
    !sub.client_secret ||
    !sub.azure_tenant_id ||
    DEMO_CLIENT_IDS.has(sub.client_id) ||
    DEMO_CLIENT_SECRETS.has(sub.client_secret)
  );
}

/**
 * Returns a demo stub client bundle — all SDK methods throw a
 * recognisable DemoModeError so callers can provide fallback data.
 */
function buildDemoClientBundle(sub) {
  const demoErr = () => {
    const e = new Error('DEMO_MODE: No real Azure credentials configured for this subscription.');
    e.code = 'DEMO_MODE';
    throw e;
  };

  // Minimal stub that satisfies the shape expected by services
  const stub = new Proxy({}, {
    get(_, prop) {
      // Allow basic property access
      if (prop === 'then') return undefined; // not a promise
      return new Proxy(() => {}, {
        apply: demoErr,
        get(__, innerProp) {
          if (innerProp === 'then') return undefined;
          return new Proxy(() => {}, {
            apply: demoErr,
            get() { return demoErr; }
          });
        }
      });
    }
  });

  return {
    isDemo: true,
    subscriptionId: sub.subscription_id,
    internalId: sub.id,
    name: sub.name,
    tenantId: sub.tenant_id,
    credential: null,
    resourceClient: stub,
    computeClient: stub,
    storageClient: stub,
    networkClient: stub,
    keyVaultClient: stub,
    monitorClient: stub,
    policyClient: stub,
    authorizationClient: stub,
    backupClient: stub,
    consumptionClient: stub,
  };
}

async function getSubscriptionCredentials(tenantId, subscriptionId) {
  const db = await getDatabase();
  return db.get(
    'SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (subscription_id = ? OR id = ?)',
    [tenantId, subscriptionId, subscriptionId]
  );
}

/**
 * Build and cache all Azure SDK clients for a given subscription.
 * For demo/mock subscriptions, returns a safe stub bundle.
 * @returns {Object} SDK client bundle including credential instance
 */
async function getAzureClients(tenantId, subscriptionId) {
  const cacheKey = `${tenantId}:${subscriptionId}`;

  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey);
  }

  const sub = await getSubscriptionCredentials(tenantId, subscriptionId);
  if (!sub) {
    throw new Error(
      `Subscription ${subscriptionId} not found or access denied for tenant ${tenantId}`
    );
  }

  // ── Demo / mock credential detection ───────────────────────
  if (isDemoCredential(sub)) {
    console.log(`[CREDENTIALS] Demo mode active for subscription "${sub.name}" (${sub.id})`);
    const bundle = buildDemoClientBundle(sub);
    clientCache.set(cacheKey, bundle);
    return bundle;
  }

  // ── Real Azure credential path ──────────────────────────────
  try {
    const credential = new ClientSecretCredential(
      sub.azure_tenant_id,
      sub.client_id,
      sub.client_secret
    );

    const realSubId = sub.subscription_id;

    const clients = {
      credential,
      isDemo: false,
      subscriptionId: realSubId,
      internalId: sub.id,
      name: sub.name,
      tenantId: sub.tenant_id,

      // Resource management
      resourceClient: new ResourceManagementClient(credential, realSubId),
      computeClient: new ComputeManagementClient(credential, realSubId),
      storageClient: new StorageManagementClient(credential, realSubId),
      networkClient: new NetworkManagementClient(credential, realSubId),
      keyVaultClient: new KeyVaultManagementClient(credential, realSubId),

      // Monitoring & compliance
      monitorClient: new MonitorClient(credential, realSubId),
      policyClient: new PolicyClient(credential, realSubId),
      authorizationClient: new AuthorizationManagementClient(credential, realSubId),

      // Backup & recovery
      backupClient: new RecoveryServicesBackupClient(credential, realSubId),

      // Cost management
      consumptionClient: new ConsumptionManagementClient(credential, realSubId),
    };

    clientCache.set(cacheKey, clients);
    return clients;
  } catch (error) {
    console.error(
      `[CREDENTIALS] Failed to initialize Azure SDK for subscription ${subscriptionId}:`,
      error.message
    );
    throw new Error(
      `Failed to authenticate with Azure for subscription "${sub.name}": ${error.message}`
    );
  }
}

/**
 * Build an On-Behalf-Of client using the user's MSAL access token.
 * Used for user-delegated operations via MSAL interactive auth.
 */
async function getOboClients(tenantId, subscriptionId, userAccessToken) {
  const sub = await getSubscriptionCredentials(tenantId, subscriptionId);
  if (!sub) {
    throw new Error(`Subscription ${subscriptionId} not found.`);
  }

  if (isDemoCredential(sub)) {
    return buildDemoClientBundle(sub);
  }

  const oboCredential = new OnBehalfOfCredential({
    tenantId: sub.azure_tenant_id,
    clientId: sub.client_id,
    clientSecret: sub.client_secret,
    userAssertionToken: userAccessToken
  });

  return {
    credential: oboCredential,
    subscriptionId: sub.subscription_id,
    resourceClient: new ResourceManagementClient(oboCredential, sub.subscription_id),
    computeClient: new ComputeManagementClient(oboCredential, sub.subscription_id)
  };
}

/**
 * Evict cached clients — call when credentials are updated.
 */
function clearClientCache(tenantId, subscriptionId) {
  const cacheKey = `${tenantId}:${subscriptionId}`;
  if (clientCache.has(cacheKey)) {
    clientCache.delete(cacheKey);
    console.log(`[CREDENTIALS] Cleared client cache for ${cacheKey}`);
  }
}

/**
 * Evict all cached clients for a tenant.
 */
function clearTenantCache(tenantId) {
  for (const key of clientCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) {
      clientCache.delete(key);
    }
  }
  console.log(`[CREDENTIALS] Cleared all client caches for tenant ${tenantId}`);
}

module.exports = {
  getAzureClients,
  getOboClients,
  clearClientCache,
  clearTenantCache,
  isDemoCredential,
};
