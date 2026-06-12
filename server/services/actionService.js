// ============================================================
// Resource Management Actions Service
// Starts, stops, restarts VMs, provisions storage, deploys VMs
// ============================================================

const { getAzureClients } = require('./azureCredentialManager');
const { getDatabase } = require('../db/database');

/**
 * Perform power actions on virtual machines (Start, Stop, Restart)
 */
async function executeVmAction(tenantId, subscriptionId, resourceId, action, userEmail, userId) {
  const db = await getDatabase();
  const clients = await getAzureClients(tenantId, subscriptionId);

  // Validate resource existence in cache
  const resource = await db.get('SELECT * FROM resources WHERE id = ? AND subscription_id = ?', [resourceId, subscriptionId]);
  if (!resource) {
    throw new Error('Resource not found in cache.');
  }

  const name = resource.name;
  
  // Extract resource group from resource ID
  const rgMatch = resourceId.match(/\/resourceGroups\/([^/]+)/i);
  const resourceGroup = rgMatch ? rgMatch[1] : 'Unknown';

  if (clients.isDemo) {
    // 1. Demo Mode Simulation
    let targetStatus = 'Running';
    if (action === 'stop') targetStatus = 'Stopped';

    await db.run('UPDATE resources SET status = ?, last_discovered_at = CURRENT_TIMESTAMP WHERE id = ?', [targetStatus, resourceId]);
    
    // Log to Audit logs
    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, ?, 'Microsoft.Compute/virtualMachines', ?, ?)
    `, [tenantId, userId, userEmail, `${action.toUpperCase()}_VM`, resourceId, JSON.stringify({ resourceName: name, targetStatus })]);

    // Create incident update or notification
    const notificationId = `notif-${Math.random().toString(36).substring(2, 9)}`;
    await db.run(`
      INSERT INTO notifications (id, tenant_id, title, message, type, read)
      VALUES (?, ?, ?, ?, 'system', 0)
    `, [
      notificationId, 
      tenantId, 
      `VM Status Updated`, 
      `Virtual Machine ${name} was successfully ${action}ed by ${userEmail}.`
    ]);

    return { success: true, message: `VM ${name} ${action}ed successfully (Demo Mode).`, status: targetStatus };
  }

  // 2. Real Azure SDK VM Actions
  try {
    const computeClient = clients.computeClient;

    let resultMsg = '';
    let finalStatus = 'Unknown';

    if (action === 'start') {
      console.log(`[ACTION] Starting VM: ${name} in RG: ${resourceGroup}`);
      await computeClient.virtualMachines.beginStartAndWait(resourceGroup, name);
      finalStatus = 'Running';
      resultMsg = `VM ${name} started successfully.`;
    } else if (action === 'stop') {
      console.log(`[ACTION] Stopping VM: ${name} in RG: ${resourceGroup}`);
      // Deallocate the VM to stop charges
      await computeClient.virtualMachines.beginDeallocateAndWait(resourceGroup, name);
      finalStatus = 'Stopped';
      resultMsg = `VM ${name} stopped and deallocated successfully.`;
    } else if (action === 'restart') {
      console.log(`[ACTION] Restarting VM: ${name} in RG: ${resourceGroup}`);
      await computeClient.virtualMachines.beginRestartAndWait(resourceGroup, name);
      finalStatus = 'Running';
      resultMsg = `VM ${name} restarted successfully.`;
    } else {
      throw new Error(`Unsupported action ${action}`);
    }

    // Sync state to local cache
    await db.run('UPDATE resources SET status = ?, last_discovered_at = CURRENT_TIMESTAMP WHERE id = ?', [finalStatus, resourceId]);

    // Log to Audit logs
    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, ?, 'Microsoft.Compute/virtualMachines', ?, ?)
    `, [tenantId, userId, userEmail, `${action.toUpperCase()}_VM`, resourceId, JSON.stringify({ resourceName: name, targetStatus: finalStatus })]);

    return { success: true, message: resultMsg, status: finalStatus };
  } catch (error) {
    console.error(`[ACTION] Failed to execute ${action} on VM ${name}:`, error);
    throw new Error(`Failed to execute ${action} on Azure VM: ${error.message}`);
  }
}

/**
 * Create a new Azure Resource Group
 */
async function createResourceGroup(tenantId, subscriptionId, name, location, userEmail, userId) {
  const db = await getDatabase();
  const clients = await getAzureClients(tenantId, subscriptionId);

  const sub = await db.get('SELECT * FROM azure_subscriptions WHERE id = ?', [subscriptionId]);
  const azureSubId = sub.subscription_id;
  const resourceGroupId = `/subscriptions/${azureSubId}/resourceGroups/${name}`;

  if (clients.isDemo) {
    // Demo mode: Insert a fake Resource Group resource
    await db.run(`
      INSERT INTO resources (id, subscription_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, 'Microsoft.Resources/resourceGroups', ?, 'Active', '{}', '{}')
    `, [resourceGroupId, subscriptionId, name, name, location]);

    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, 'CREATE_RESOURCE_GROUP', 'Microsoft.Resources/resourceGroups', ?, ?)
    `, [tenantId, userId, userEmail, resourceGroupId, JSON.stringify({ name, location })]);

    return { success: true, message: `Resource group ${name} created successfully (Demo Mode).`, id: resourceGroupId };
  }

  // Real Azure API creation
  try {
    const resourceClient = clients.resourceClient;
    const result = await resourceClient.resourceGroups.createOrUpdate(name, { location });

    // Insert to DB cache
    await db.run(`
      INSERT INTO resources (id, subscription_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, 'Microsoft.Resources/resourceGroups', ?, 'Active', ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = 'Active', last_discovered_at = CURRENT_TIMESTAMP
    `, [
      result.id, 
      subscriptionId, 
      name, 
      name, 
      location, 
      JSON.stringify(result.tags || {}), 
      JSON.stringify(result.properties || {})
    ]);

    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, 'CREATE_RESOURCE_GROUP', 'Microsoft.Resources/resourceGroups', ?, ?)
    `, [tenantId, userId, userEmail, result.id, JSON.stringify({ name, location })]);

    return { success: true, message: `Resource group ${name} created successfully.`, id: result.id };
  } catch (error) {
    console.error(`[ACTION] Failed to create Resource Group ${name}:`, error);
    throw new Error(`Failed to create Resource Group in Azure: ${error.message}`);
  }
}

/**
 * Create a new Azure Storage Account
 */
async function createStorageAccount(tenantId, subscriptionId, name, resourceGroup, location, userEmail, userId) {
  const db = await getDatabase();
  const clients = await getAzureClients(tenantId, subscriptionId);

  const sub = await db.get('SELECT * FROM azure_subscriptions WHERE id = ?', [subscriptionId]);
  const azureSubId = sub.subscription_id;
  const storageAccountId = `/subscriptions/${azureSubId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${name}`;

  if (clients.isDemo) {
    // Demo mode: Insert a fake Storage Account resource
    const tags = { Environment: 'Production', Component: 'Storage' };
    const payload = { sku: 'Standard_LRS', kind: 'StorageV2', accessTier: 'Hot' };
    
    await db.run(`
      INSERT INTO resources (id, subscription_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, 'Microsoft.Storage/storageAccounts', ?, 'Available', ?, ?)
    `, [storageAccountId, subscriptionId, resourceGroup, name, location, JSON.stringify(tags), JSON.stringify(payload)]);

    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, 'CREATE_STORAGE_ACCOUNT', 'Microsoft.Storage/storageAccounts', ?, ?)
    `, [tenantId, userId, userEmail, storageAccountId, JSON.stringify({ name, resourceGroup, location })]);

    return { success: true, message: `Storage Account ${name} created successfully (Demo Mode).`, id: storageAccountId };
  }

  // Real Azure API Storage Account Creation
  try {
    const storageClient = clients.storageClient;
    console.log(`[ACTION] Provisioning Storage Account: ${name} in RG: ${resourceGroup}`);

    const parameters = {
      location,
      sku: { name: 'Standard_LRS' },
      kind: 'StorageV2',
      tags: { CreatedBy: userEmail, Tool: 'CloudOpsEnterprise' }
    };

    const result = await storageClient.storageAccounts.beginCreateAndWait(resourceGroup, name, parameters);

    // Insert to DB Cache
    await db.run(`
      INSERT INTO resources (id, subscription_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, 'Microsoft.Storage/storageAccounts', ?, 'Available', ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = 'Available', last_discovered_at = CURRENT_TIMESTAMP
    `, [
      result.id, 
      subscriptionId, 
      resourceGroup, 
      name, 
      location, 
      JSON.stringify(result.tags || {}), 
      JSON.stringify(result)
    ]);

    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, 'CREATE_STORAGE_ACCOUNT', 'Microsoft.Storage/storageAccounts', ?, ?)
    `, [tenantId, userId, userEmail, result.id, JSON.stringify({ name, resourceGroup, location })]);

    return { success: true, message: `Storage Account ${name} created successfully.`, id: result.id };
  } catch (error) {
    console.error(`[ACTION] Failed to create Storage Account ${name}:`, error);
    throw new Error(`Failed to create Storage Account in Azure: ${error.message}`);
  }
}

/**
 * Deploy a new Virtual Machine
 */
async function deployVirtualMachine(tenantId, subscriptionId, name, resourceGroup, location, size, os, userEmail, userId) {
  const db = await getDatabase();
  const clients = await getAzureClients(tenantId, subscriptionId);

  const sub = await db.get('SELECT * FROM azure_subscriptions WHERE id = ?', [subscriptionId]);
  const azureSubId = sub.subscription_id;
  const vmId = `/subscriptions/${azureSubId}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/virtualMachines/${name}`;

  if (clients.isDemo) {
    // Demo mode: Insert VM to database
    const tags = { Environment: 'Staging', CreatedBy: 'SaaS-Portal' };
    const payload = { size, os, ip: '10.0.2.14', diskSizeGB: 128 };
    
    await db.run(`
      INSERT INTO resources (id, subscription_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, 'Microsoft.Compute/virtualMachines', ?, 'Running', ?, ?)
    `, [vmId, subscriptionId, resourceGroup, name, location, JSON.stringify(tags), JSON.stringify(payload)]);

    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, 'DEPLOY_VM', 'Microsoft.Compute/virtualMachines', ?, ?)
    `, [tenantId, userId, userEmail, vmId, JSON.stringify({ name, size, os, resourceGroup, location })]);

    return { success: true, message: `Virtual Machine ${name} deployed successfully (Demo Mode).`, id: vmId };
  }

  // Real Azure API Virtual Machine Provisioning
  try {
    const computeClient = clients.computeClient;
    console.log(`[ACTION] Deploying Virtual Machine: ${name} (${size}, ${os}) in RG: ${resourceGroup}`);

    // Set standard username and generate password for demo VM
    const adminUsername = 'azureuser';
    const adminPassword = 'Password1234!'; // In production, this should be dynamically generated/injected via Key Vault

    // VM image reference map
    let imageReference = {
      publisher: 'Canonical',
      offer: '0001-com-ubuntu-server-jammy',
      sku: '22_04-lts-gen2',
      version: 'latest'
    };

    if (os.toLowerCase().includes('windows')) {
      imageReference = {
        publisher: 'MicrosoftWindowsServer',
        offer: 'WindowsServer',
        sku: '2022-datacenter-azure-edition',
        version: 'latest'
      };
    }

    const parameters = {
      location,
      hardwareProfile: { vmSize: size },
      storageProfile: {
        imageReference,
        osDisk: {
          name: `${name}_OsDisk`,
          caching: 'ReadWrite',
          createOption: 'FromImage',
          managedDisk: { storageAccountType: 'StandardSSD_LRS' }
        }
      },
      osProfile: {
        computerName: name,
        adminUsername,
        adminPassword
      },
      // Note: A real VM deployment requires Network Interface card parameters.
      // For this action, we assume there is an existing NIC named [name]-nic in the same RG,
      // or we throw a helpful warning/error to the user that full networking setup is required.
      networkProfile: {
        networkInterfaces: [
          {
            id: `/subscriptions/${azureSubId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/networkInterfaces/${name}-nic`,
            primary: true
          }
        ]
      },
      tags: { CreatedBy: userEmail, Purpose: 'CloudOpsVM' }
    };

    const result = await computeClient.virtualMachines.beginCreateOrUpdateAndWait(resourceGroup, name, parameters);

    // Insert to DB cache
    await db.run(`
      INSERT INTO resources (id, subscription_id, resource_group, name, type, location, status, tags, raw_payload)
      VALUES (?, ?, ?, ?, 'Microsoft.Compute/virtualMachines', ?, 'Running', ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = 'Running', last_discovered_at = CURRENT_TIMESTAMP
    `, [
      result.id, 
      subscriptionId, 
      resourceGroup, 
      name, 
      location, 
      JSON.stringify(result.tags || {}), 
      JSON.stringify(result)
    ]);

    await db.run(`
      INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, 'DEPLOY_VM', 'Microsoft.Compute/virtualMachines', ?, ?)
    `, [tenantId, userId, userEmail, result.id, JSON.stringify({ name, size, os, resourceGroup, location })]);

    return { success: true, message: `Virtual machine ${name} successfully deployed.`, id: result.id };
  } catch (error) {
    console.error(`[ACTION] Failed to deploy Virtual Machine ${name}:`, error);
    throw new Error(`Virtual Machine deployment failed: ${error.message}. Note: Network Interface named '${name}-nic' must exist in resource group '${resourceGroup}' for direct VM creation.`);
  }
}

module.exports = {
  executeVmAction,
  createResourceGroup,
  createStorageAccount,
  deployVirtualMachine
};
