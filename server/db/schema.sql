-- ============================================================
-- CloudOps Enterprise SaaS - Database Schema (SQLite)
-- ============================================================

-- Enable foreign keys support
PRAGMA foreign_keys = ON;

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    role TEXT CHECK(role IN ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER', 'AUDITOR')) NOT NULL DEFAULT 'VIEWER',
    tenant_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 3. Azure Subscriptions Table
CREATE TABLE IF NOT EXISTS azure_subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    name TEXT NOT NULL,
    client_id TEXT,
    client_secret TEXT,
    azure_tenant_id TEXT,
    auth_type TEXT CHECK(auth_type IN ('MSAL', 'CREDENTIALS')) NOT NULL DEFAULT 'MSAL',
    status TEXT NOT NULL DEFAULT 'Active',
    active_resource_group TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 4. Discovered Resources Table
CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY, -- Fully qualified Azure Resource ID
    subscription_id TEXT NOT NULL,
    resource_group TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Running',
    tags TEXT, -- JSON String
    raw_payload TEXT, -- JSON String
    last_discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    owner TEXT,
    last_modified TEXT,
    cost_impact REAL DEFAULT 0,
    risk_score REAL DEFAULT 0,
    health_status TEXT DEFAULT 'Healthy',
    FOREIGN KEY(subscription_id) REFERENCES azure_subscriptions(id) ON DELETE CASCADE
);

-- 5. Incidents Table
CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    resource_id TEXT,
    title TEXT NOT NULL,
    severity TEXT CHECK(severity IN ('CRITICAL', 'WARNING', 'INFORMATIONAL', 'SEV0', 'SEV1', 'SEV2', 'SEV3')) NOT NULL,
    status TEXT CHECK(status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED', 'NEW', 'IN_PROGRESS')) NOT NULL DEFAULT 'ACTIVE',
    category TEXT CHECK(category IN ('Security', 'Performance', 'Cost', 'Backup', 'Governance', 'Availability')) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    assigned_team TEXT,
    resolution_progress INTEGER DEFAULT 0,
    root_cause TEXT,
    postmortem TEXT,
    escalation_level INTEGER DEFAULT 0,
    FOREIGN KEY(subscription_id) REFERENCES azure_subscriptions(id) ON DELETE CASCADE
);

-- 9. Resource Changes Table (Drift tracking)
CREATE TABLE IF NOT EXISTS resource_changes (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    change_type TEXT NOT NULL, -- e.g. Create, Update, Delete
    timestamp TEXT,
    changed_properties TEXT, -- JSON Array of changed properties
    FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

-- 10. Governance Findings Table
CREATE TABLE IF NOT EXISTS governance_findings (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    type TEXT NOT NULL, -- e.g. PolicyViolation, TagCompliance, NamingStandard, ResourceLock
    severity TEXT NOT NULL, -- e.g. Critical, High, Medium, Low
    details TEXT, -- JSON string or description
    recommendation TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(subscription_id) REFERENCES azure_subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
);


-- 6. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details TEXT, -- JSON String
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 7. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT CHECK(type IN ('incident', 'cost', 'system', 'security')) NOT NULL,
    read INTEGER DEFAULT 0, -- 0 = Unread, 1 = Read
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 8. Cost Budgets Table
CREATE TABLE IF NOT EXISTS cost_budgets (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    amount REAL NOT NULL,
    time_grain TEXT CHECK(time_grain IN ('MONTHLY', 'QUARTERLY', 'YEARLY')) NOT NULL DEFAULT 'MONTHLY',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(subscription_id) REFERENCES azure_subscriptions(id) ON DELETE CASCADE
);
