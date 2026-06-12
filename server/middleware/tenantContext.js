// ============================================================
// Tenant Context Middleware
// Resolves and provisions tenants and users from JWT claims
// ============================================================

const { getDatabase } = require('../db/database');

async function tenantContext(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Access Denied: User context not authenticated' });
    }

    const db = await getDatabase();
    
    // Extract tenant ID from MSAL/Entra ID 'tid' claim or fallback to mock tenant
    const tenantId = req.user.tid || req.user.tenantId || 'demo-org-001';
    
    // User identifier from MSAL/Entra ID 'oid' / 'sub' or fallback
    const userId = req.user.oid || req.user.sub || req.user.id || `demo-user-${(req.user.roles && req.user.roles[0] || 'viewer').toLowerCase()}`;
    const email = req.user.upn || req.user.unique_name || req.user.email || `${userId}@cloudops-demo.com`;
    const displayName = req.user.name || req.user.displayName || email.split('@')[0];

    // Determine the mapped role (Owner, Admin, Operator, Auditor, Viewer)
    let role = 'VIEWER';
    const userRoles = req.user.roles || [];
    
    if (userRoles.includes('Platform.Owner') || userRoles.includes('OWNER')) {
      role = 'OWNER';
    } else if (userRoles.includes('Platform.Admin') || userRoles.includes('ADMIN')) {
      role = 'ADMIN';
    } else if (userRoles.includes('Platform.Operator') || userRoles.includes('OPERATOR') || userRoles.includes('OPERATIONS')) {
      role = 'OPERATOR';
    } else if (userRoles.includes('Platform.Auditor') || userRoles.includes('AUDITOR')) {
      role = 'AUDITOR';
    } else {
      // Default mappings if no claims matched
      if (email.startsWith('owner@') || email.includes('owner')) role = 'OWNER';
      else if (email.startsWith('admin@') || email.includes('admin')) role = 'ADMIN';
      else if (email.startsWith('ops@') || email.includes('operator')) role = 'OPERATOR';
      else if (email.startsWith('auditor@') || email.includes('auditor')) role = 'AUDITOR';
    }

    // 1. Ensure Tenant exists in DB
    let tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      const tenantName = tenantId === 'demo-org-001' ? 'Contoso Health Systems' : `Org-Tenant-${tenantId.substring(0, 8)}`;
      await db.run('INSERT INTO tenants (id, name) VALUES (?, ?)', [tenantId, tenantName]);
      console.log(`[TENANT] Auto-provisioned tenant: ${tenantName} (${tenantId})`);
    }

    // 2. Ensure User exists and is mapped to this tenant
    let dbUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!dbUser) {
      await db.run('INSERT INTO users (id, email, display_name, role, tenant_id) VALUES (?, ?, ?, ?, ?)', [
        userId, email, displayName, role, tenantId
      ]);
      console.log(`[USER] Auto-provisioned user: ${email} (${role}) in tenant ${tenantId}`);
    } else {
      // Sync user details if they have changed (e.g. role updates from token claims)
      await db.run('UPDATE users SET display_name = ?, role = ?, email = ? WHERE id = ?', [
        displayName, role, email, userId
      ]);
    }

    // Attach resolved properties to the request context
    req.tenantId = tenantId;
    req.userId = userId;
    req.userEmail = email;
    req.userRole = role;

    next();
  } catch (error) {
    console.error('[MIDDLEWARE] Tenant context resolution failed:', error);
    res.status(500).json({ error: 'Internal server error resolving tenant context' });
  }
}

module.exports = tenantContext;
