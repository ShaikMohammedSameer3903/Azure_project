// ============================================================
// Database Manager (SQLite)
// ============================================================

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let db = null;

async function getDatabase() {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../cloudops.db');
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Open the SQLite database
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign key support
  await db.run('PRAGMA foreign_keys = ON;');

  // Initialize schema
  const schemaPath = path.resolve(__dirname, './schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  
  // SQLite multiple statements execution
  // Note: .exec executes multiple statements separated by semicolons
  await db.exec(schemaSql);

  // Handle migration for new resource columns if existing database doesn't have them
  try {
    const columns = await db.all('PRAGMA table_info(resources)');
    const colNames = columns.map(c => c.name);
    
    if (!colNames.includes('owner')) {
      console.log('[DB] Migrating: Adding owner column to resources');
      await db.run('ALTER TABLE resources ADD COLUMN owner TEXT');
    }
    if (!colNames.includes('last_modified')) {
      console.log('[DB] Migrating: Adding last_modified column to resources');
      await db.run('ALTER TABLE resources ADD COLUMN last_modified TEXT');
    }
    if (!colNames.includes('cost_impact')) {
      console.log('[DB] Migrating: Adding cost_impact column to resources');
      await db.run('ALTER TABLE resources ADD COLUMN cost_impact REAL DEFAULT 0');
    }
    if (!colNames.includes('risk_score')) {
      console.log('[DB] Migrating: Adding risk_score column to resources');
      await db.run('ALTER TABLE resources ADD COLUMN risk_score REAL DEFAULT 0');
    }
    if (!colNames.includes('health_status')) {
      console.log('[DB] Migrating: Adding health_status column to resources');
      await db.run('ALTER TABLE resources ADD COLUMN health_status TEXT DEFAULT "Healthy"');
    }
  } catch (err) {
    console.error('[DB] Migration of resources columns failed:', err);
  }

  // Handle migration for active_resource_group if existing database doesn't have it
  try {
    const columns = await db.all('PRAGMA table_info(azure_subscriptions)');
    const hasActiveRg = columns.some(col => col.name === 'active_resource_group');
    if (!hasActiveRg) {
      console.log('[DB] Migrating: Adding active_resource_group column to azure_subscriptions');
      await db.run('ALTER TABLE azure_subscriptions ADD COLUMN active_resource_group TEXT');
    }
  } catch (err) {
    console.error('[DB] Migration of active_resource_group failed:', err);
  }


  // Check if seeding is needed
  const tenantCheck = await db.get('SELECT COUNT(*) as count FROM tenants');
  if (tenantCheck.count === 0) {
    console.log('[DB] Seeding database with default demo data...');
    await seedDemoData(db);
  }

  return db;
}

async function seedDemoData(database) {
  // 1. Seed Demo Tenants
  await database.run(`
    INSERT INTO tenants (id, name) 
    VALUES ('demo-org-001', 'Contoso Health Systems')
  `);

  // 2. Seed Users
  const roles = ['OWNER', 'ADMIN', 'OPERATOR', 'VIEWER', 'AUDITOR'];
  for (const role of roles) {
    const email = `${role.toLowerCase()}@cloudops-demo.com`;
    const displayName = {
      OWNER: 'Alex Thompson',
      ADMIN: 'Sarah Mitchell',
      OPERATOR: 'David Chen',
      VIEWER: 'Emily Rivera',
      AUDITOR: 'Michael Park'
    }[role];
    const id = `demo-${role.toLowerCase()}-001`;
    await database.run(`
      INSERT INTO users (id, email, display_name, role, tenant_id)
      VALUES (?, ?, ?, ?, 'demo-org-001')
    `, [id, email, displayName, role]);
  }

  // 3. Seed Subscriptions
  await database.run(`
    INSERT INTO azure_subscriptions (id, tenant_id, subscription_id, name, client_id, client_secret, azure_tenant_id, auth_type, status)
    VALUES 
      ('sub-healthcare-prod', 'demo-org-001', 'd10be971-c619-4887-8737-b8054407194e', 'Contoso Health-Production', 'demo-client-id', 'demo-client-secret', '808cc83e-a546-47e7-a03f-73a1ebba24f3', 'MSAL', 'Active'),
      ('sub-university-prod', 'demo-org-001', 'u55fe912-b129-4127-9827-c8051207901c', 'Contoso University-Production', 'demo-client-id', 'demo-client-secret', '808cc83e-a546-47e7-a03f-73a1ebba24f3', 'CREDENTIALS', 'Active'),
      ('sub-corporate-it', 'demo-org-001', 'a34fe912-b129-4127-9827-c8051207901b', 'Contoso Corporate-IT', 'demo-client-id', 'demo-client-secret', '808cc83e-a546-47e7-a03f-73a1ebba24f3', 'CREDENTIALS', 'Active'),
      ('sub-dev-test', 'demo-org-001', 'e22dd811-e234-4112-a123-f34938491823', 'Contoso Sandbox-DevTest', 'demo-client-id', 'demo-client-secret', '808cc83e-a546-47e7-a03f-73a1ebba24f3', 'MSAL', 'Active')
  `);

  // 4. Seed Resources (Realistic Azure Resources)
  const seedResources = [
    // Sub 1: Contoso Health-Production (RG-Healthcare-Prod)
    {
      id: '/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.Web/sites/app-hc-patient-portal',
      sub_id: 'sub-healthcare-prod',
      rg: 'RG-Healthcare-Prod',
      name: 'app-hc-patient-portal',
      type: 'Microsoft.Web/sites',
      location: 'southeastasia',
      status: 'Running',
      tags: { Environment: 'Healthcare', Component: 'Patient Portal', Compliance: 'HIPAA', Owner: 'Dr. Sarah Mitchell' },
      payload: { state: 'Running', defaultHostName: 'app-hc-patient-portal.azurewebsites.net', httpsOnly: true, runtime: 'Node | 20 LTS' }
    },
    {
      id: '/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.KeyVault/vaults/kv-hc-prod-secrets',
      sub_id: 'sub-healthcare-prod',
      rg: 'RG-Healthcare-Prod',
      name: 'kv-hc-prod-secrets',
      type: 'Microsoft.KeyVault/vaults',
      location: 'southeastasia',
      status: 'Active',
      tags: { Environment: 'Healthcare', Component: 'Key Vault', Encryption: 'CustomerManaged', Owner: 'Security Admin' },
      payload: { sku: 'Premium', softDeleteEnabled: true, purgeProtectionEnabled: true, secretCount: 18 }
    },
    {
      id: '/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.Insights/components/ai-hc-prod-telemetry',
      sub_id: 'sub-healthcare-prod',
      rg: 'RG-Healthcare-Prod',
      name: 'ai-hc-prod-telemetry',
      type: 'Microsoft.Insights/components',
      location: 'southeastasia',
      status: 'Active',
      tags: { Environment: 'Healthcare', Component: 'Application Insights', Owner: 'Sarah Mitchell' },
      payload: { Application_Type: 'web', Flow_Type: 'Bluefield', Request_Source: 'RestAPI' }
    },
    {
      id: '/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.OperationalInsights/workspaces/law-hc-prod-logs',
      sub_id: 'sub-healthcare-prod',
      rg: 'RG-Healthcare-Prod',
      name: 'law-hc-prod-logs',
      type: 'Microsoft.OperationalInsights/workspaces',
      location: 'southeastasia',
      status: 'Active',
      tags: { Environment: 'Healthcare', Component: 'Log Analytics Workspace', Owner: 'David Chen' },
      payload: { sku: { name: 'PerGB2018' }, retentionInDays: 90 }
    },
    {
      id: '/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.RecoveryServices/vaults/rsv-hc-prod-backup',
      sub_id: 'sub-healthcare-prod',
      rg: 'RG-Healthcare-Prod',
      name: 'rsv-hc-prod-backup',
      type: 'Microsoft.RecoveryServices/vaults',
      location: 'southeastasia',
      status: 'Active',
      tags: { Environment: 'Healthcare', Component: 'Recovery Services Vault', Owner: 'David Chen' },
      payload: { sku: { name: 'RS0', tier: 'Standard' } }
    },
    {
      id: '/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.Insights/metricAlerts/alert-hc-portal-availability',
      sub_id: 'sub-healthcare-prod',
      rg: 'RG-Healthcare-Prod',
      name: 'alert-hc-portal-availability',
      type: 'Microsoft.Insights/metricAlerts',
      location: 'global',
      status: 'Enabled',
      tags: { Environment: 'Healthcare', Component: 'Azure Monitor Alerts', Owner: 'David Chen' },
      payload: { severity: 1, criteria: { 'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria' } }
    },

    // Sub 2: Contoso University-Production (RG-University-Prod)
    {
      id: '/subscriptions/u55fe912-b129-4127-9827-c8051207901c/resourceGroups/RG-University-Prod/providers/Microsoft.Web/sites/app-univ-student-portal',
      sub_id: 'sub-university-prod',
      rg: 'RG-University-Prod',
      name: 'app-univ-student-portal',
      type: 'Microsoft.Web/sites',
      location: 'eastus2',
      status: 'Running',
      tags: { Environment: 'University', Component: 'Student Portal', Owner: 'Michael Park' },
      payload: { state: 'Running', defaultHostName: 'app-univ-student-portal.azurewebsites.net', httpsOnly: true }
    },
    {
      id: '/subscriptions/u55fe912-b129-4127-9827-c8051207901c/resourceGroups/RG-University-Prod/providers/Microsoft.Storage/storageAccounts/saunivrecords',
      sub_id: 'sub-university-prod',
      rg: 'RG-University-Prod',
      name: 'saunivrecords',
      type: 'Microsoft.Storage/storageAccounts',
      location: 'eastus2',
      status: 'Available',
      tags: { Environment: 'University', Component: 'Storage Account', Owner: 'Michael Park' },
      payload: { sku: 'Standard_LRS', kind: 'StorageV2' }
    },
    {
      id: '/subscriptions/u55fe912-b129-4127-9827-c8051207901c/resourceGroups/RG-University-Prod/providers/Microsoft.KeyVault/vaults/kv-univ-prod-secrets',
      sub_id: 'sub-university-prod',
      rg: 'RG-University-Prod',
      name: 'kv-univ-prod-secrets',
      type: 'Microsoft.KeyVault/vaults',
      location: 'eastus2',
      status: 'Active',
      tags: { Environment: 'University', Component: 'Key Vault', Owner: 'Security Team' },
      payload: { sku: 'Standard', softDeleteEnabled: true }
    },
    {
      id: '/subscriptions/u55fe912-b129-4127-9827-c8051207901c/resourceGroups/RG-University-Prod/providers/Microsoft.Insights/components/ai-univ-prod-telemetry',
      sub_id: 'sub-university-prod',
      rg: 'RG-University-Prod',
      name: 'ai-univ-prod-telemetry',
      type: 'Microsoft.Insights/components',
      location: 'eastus2',
      status: 'Active',
      tags: { Environment: 'University', Component: 'Application Insights', Owner: 'Sarah Mitchell' },
      payload: { Application_Type: 'web' }
    },
    {
      id: '/subscriptions/u55fe912-b129-4127-9827-c8051207901c/resourceGroups/RG-University-Prod/providers/Microsoft.OperationalInsights/workspaces/law-univ-prod-logs',
      sub_id: 'sub-university-prod',
      rg: 'RG-University-Prod',
      name: 'law-univ-prod-logs',
      type: 'Microsoft.OperationalInsights/workspaces',
      location: 'eastus2',
      status: 'Active',
      tags: { Environment: 'University', Component: 'Log Analytics Workspace', Owner: 'Michael Park' },
      payload: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
    },
    {
      id: '/subscriptions/u55fe912-b129-4127-9827-c8051207901c/resourceGroups/RG-University-Prod/providers/Microsoft.Insights/metricAlerts/alert-univ-portal-cpu',
      sub_id: 'sub-university-prod',
      rg: 'RG-University-Prod',
      name: 'alert-univ-portal-cpu',
      type: 'Microsoft.Insights/metricAlerts',
      location: 'global',
      status: 'Enabled',
      tags: { Environment: 'University', Component: 'Azure Monitor Alerts', Owner: 'Michael Park' },
      payload: { severity: 2 }
    },

    // Sub 3: Contoso Corporate-IT
    {
      id: '/subscriptions/a34fe912-b129-4127-9827-c8051207901b/resourceGroups/RG-Corporate-IT-Hub/providers/Microsoft.Compute/virtualMachines/vm-corp-ad-01',
      sub_id: 'sub-corporate-it',
      rg: 'RG-Corporate-IT-Hub',
      name: 'vm-corp-ad-01',
      type: 'Microsoft.Compute/virtualMachines',
      location: 'eastus',
      status: 'Running',
      tags: { Environment: 'Core-IT', Service: 'ActiveDirectory' },
      payload: { size: 'Standard_D2s_v5', os: 'Windows Server 2022', ip: '192.168.1.4', diskSizeGB: 128 }
    },
    {
      id: '/subscriptions/a34fe912-b129-4127-9827-c8051207901b/resourceGroups/RG-Corporate-IT-Hub/providers/Microsoft.Compute/virtualMachines/vm-corp-vpn-gateway',
      sub_id: 'sub-corporate-it',
      rg: 'RG-Corporate-IT-Hub',
      name: 'vm-corp-vpn-gateway',
      type: 'Microsoft.Compute/virtualMachines',
      location: 'eastus',
      status: 'Stopped',
      tags: { Environment: 'Core-IT', Service: 'Network' },
      payload: { size: 'Standard_F2s_v2', os: 'Ubuntu 20.04 LTS', ip: '192.168.1.10', diskSizeGB: 64 }
    },
    {
      id: '/subscriptions/a34fe912-b129-4127-9827-c8051207901b/resourceGroups/RG-Corporate-IT-Hub/providers/Microsoft.Storage/storageAccounts/sacorpshareddocs',
      sub_id: 'sub-corporate-it',
      rg: 'RG-Corporate-IT-Hub',
      name: 'sacorpshareddocs',
      type: 'Microsoft.Storage/storageAccounts',
      location: 'eastus',
      status: 'Available',
      tags: { Environment: 'Core-IT', Component: 'Storage' },
      payload: { sku: 'Standard_LRS', kind: 'StorageV2', accessTier: 'Hot' }
    },

    // Sub 4: Contoso Sandbox-DevTest
    {
      id: '/subscriptions/e22dd811-e234-4112-a123-f34938491823/resourceGroups/RG-Sandbox-Dev/providers/Microsoft.Compute/virtualMachines/vm-sandbox-dev-test',
      sub_id: 'sub-dev-test',
      rg: 'RG-Sandbox-Dev',
      name: 'vm-sandbox-dev-test',
      type: 'Microsoft.Compute/virtualMachines',
      location: 'westus2',
      status: 'Stopped',
      tags: { Environment: 'Development', Component: 'Testing' },
      payload: { size: 'Standard_B2s', os: 'Ubuntu 22.04 LTS', ip: '10.0.1.20', diskSizeGB: 30 }
    }
  ];


  for (const res of seedResources) {
    const owner = res.tags?.Owner || 'Unassigned';
    const lastModified = new Date().toISOString();
    const costImpact = res.type?.toLowerCase().includes('virtualmachines') ? 80 : 20;
    const riskScore = res.type?.toLowerCase().includes('keyvault') ? 35 : 10;
    const healthStatus = riskScore >= 50 ? 'Critical' : riskScore >= 20 ? 'Warning' : 'Healthy';

    await database.run(`
      INSERT INTO resources (
        id, subscription_id, resource_group, name, type, location, status, tags, raw_payload,
        owner, last_modified, cost_impact, risk_score, health_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      res.id,
      res.sub_id,
      res.rg,
      res.name,
      res.type,
      res.location,
      res.status,
      JSON.stringify(res.tags),
      JSON.stringify(res.payload),
      owner,
      lastModified,
      costImpact,
      riskScore,
      healthStatus
    ]);
  }


  // 5. Seed Incidents
  const seedIncidents = [
    {
      id: 'inc-001',
      sub_id: 'sub-healthcare-prod',
      res_id: '/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.Compute/virtualMachines/vm-hc-prod-web',
      title: 'High CPU Utilization Alert',
      severity: 'WARNING',
      status: 'ACTIVE',
      category: 'Performance',
      description: 'Virtual machine vm-hc-prod-web CPU usage exceeded 85% threshold for 3 consecutive check cycles.'
    },
    {
      id: 'inc-002',
      sub_id: 'sub-healthcare-prod',
      res_id: '/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.KeyVault/vaults/kv-hc-prod-secrets',
      title: 'Unusual Key Vault Access Pattern Detected',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      category: 'Security',
      description: 'Multiple unauthorized attempts to fetch secrets from kv-hc-prod-secrets from client IP 185.220.101.4.'
    },
    {
      id: 'inc-003',
      sub_id: 'sub-healthcare-prod',
      res_id: '/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.Compute/virtualMachines/vm-hc-prod-api',
      title: 'API Gateway Timeout Errors',
      severity: 'WARNING',
      status: 'ACKNOWLEDGED',
      category: 'Performance',
      description: 'HTTP 504 Gateway Timeout rates have spike to 12% in the last 10 minutes.'
    },
    {
      id: 'inc-004',
      sub_id: 'sub-corporate-it',
      res_id: '/subscriptions/a34fe912-b129-4127-9827-c8051207901b/resourceGroups/RG-Corporate-IT-Hub/providers/Microsoft.Compute/virtualMachines/vm-corp-vpn-gateway',
      title: 'Gateway VPN Offline',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      category: 'Performance',
      description: 'VPN Server is stopped. Remote branch connectivity has dropped.'
    }
  ];

  for (const inc of seedIncidents) {
    await database.run(`
      INSERT INTO incidents (id, subscription_id, resource_id, title, severity, status, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [inc.id, inc.sub_id, inc.res_id, inc.title, inc.severity, inc.status, inc.category, inc.description]);
  }

  // 6. Seed Budgets
  await database.run(`
    INSERT INTO cost_budgets (id, subscription_id, amount, time_grain)
    VALUES 
      ('bg-001', 'sub-healthcare-prod', 2500.0, 'MONTHLY'),
      ('bg-002', 'sub-corporate-it', 1200.0, 'MONTHLY'),
      ('bg-003', 'sub-dev-test', 300.0, 'MONTHLY')
  `);

  // 7. Seed Notifications
  const seedNotifications = [
    { id: 'notif-001', title: 'Critical Alert', msg: 'Security Score has dropped by 4 points due to open port 3389 on vm-corp-ad-01.', type: 'security' },
    { id: 'notif-002', title: 'Monthly Budget Alert', msg: 'Subscription Contoso Health-Production has consumed 82% of its monthly cost budget.', type: 'cost' },
    { id: 'notif-003', title: 'New Incident Triggered', msg: 'Key Vault access pattern breach identified in Southeast Asia.', type: 'incident' },
    { id: 'notif-004', title: 'Backup Successful', msg: 'Nightly database backup job for db-hc-records completed with status: Succeeded.', type: 'system' }
  ];

  for (const not of seedNotifications) {
    await database.run(`
      INSERT INTO notifications (id, tenant_id, title, message, type, read)
      VALUES (?, 'demo-org-001', ?, ?, ?, 0)
    `, [not.id, not.title, not.msg, not.type]);
  }

  // 8. Seed Audit Logs
  await database.run(`
    INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
    VALUES 
      ('demo-org-001', 'demo-admin-001', 'admin@cloudops-demo.com', 'DISCOVER_RESOURCES', 'AzureSubscription', 'sub-healthcare-prod', '{"discoveredCount":7}'),
      ('demo-org-001', 'demo-operator-001', 'ops@cloudops-demo.com', 'START_VM', 'Microsoft.Compute/virtualMachines', 'vm-hc-prod-web', '{"initiator":"ops@cloudops-demo.com"}'),
      ('demo-org-001', 'demo-admin-001', 'admin@cloudops-demo.com', 'CREATE_BUDGET', 'CostBudget', 'bg-001', '{"amount":2500}')
  `);
}

module.exports = {
  getDatabase
};
