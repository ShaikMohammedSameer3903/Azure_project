// ============================================================
// CloudOps Enterprise - Backend Entrypoint
// Modularized for multi-tenant scalability
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Initialize Application Insights
const appInsights = require('applicationinsights');
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true)
    .setUseDiskRetryCaching(true)
    .setSendLiveMetrics(true)
    .start();
}

const { getDatabase } = require('./db/database');
const tenantContext = require('./middleware/tenantContext');

const app = express();
const PORT = process.env.PORT || 3001;

// 1. SSL/TLS Certificate Loading for HTTPS (optional local config)
let credentials = null;
const keyPath = path.resolve(__dirname, './key.pem');
const certPath = path.resolve(__dirname, './cert.pem');
// Load SSL certificates only in production
if (process.env.NODE_ENV === 'production' && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  try {
    credentials = {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8')
    };
  } catch (err) {
    console.warn('[SERVER] Could not load SSL certificates, falling back to HTTP.');
  }
} else {
  console.info('[SERVER] Development mode: using HTTP without SSL.');
}

// 2. Security Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP for local dev compatibility if needed
}));

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173',
  'https://localhost:5173',
  'http://localhost:3000',
  'https://localhost:3000',
  'https://zealous-river-08f22d600.7.azurestaticapps.net'
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/^https:\/\/[a-z0-9-]+\.azurestaticapps\.net$/.test(origin)) return callback(null, true);
    if (/^https:\/\/[a-z0-9-]+\.azurewebsites\.net$/.test(origin)) return callback(null, true);
    callback(new Error('CORS: origin not allowed - ' + origin));
  },
  credentials: true
}));

app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests. Please try again later.' }
});
app.use('/api/', limiter);

// 3. JWT Token Authentication Middleware
const client = jwksClient({
  jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys'
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) {
      callback(err);
    } else {
      const signingKey = key.publicKey || key.rsaPublicKey;
      callback(null, signingKey);
    }
  });
}

function validateJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access Denied: Missing Bearer Token' });
  }

  const token = authHeader.split(' ')[1];

  // Dev-Mock Auth Handshake — DISABLED in production for security
  const allowDemoTokens = process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_TOKENS === 'true';
  if (allowDemoTokens && (token.startsWith('mock-token-') || token.startsWith('demo-token-'))) {
    const rawRole = token.replace('mock-token-', '').replace('demo-token-', '').toUpperCase();
    const role = ['OWNER', 'ADMIN', 'OPERATOR', 'VIEWER', 'AUDITOR'].includes(rawRole) ? rawRole : 'ADMIN';
    
    req.user = {
      oid: `demo-${role.toLowerCase()}-001`,
      upn: `${role.toLowerCase()}@cloudops-demo.com`,
      roles: [role],
      name: `${role.charAt(0) + role.slice(1).toLowerCase()} Demo User`,
      tenantId: 'demo-org-001'
    };
    return next();
  }

  // Real Entra ID Token Verification
  jwt.verify(token, getKey, {
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      console.error('[AUTH] Token validation failed:', err.message);
      return res.status(403).json({ error: 'Access Denied: Invalid or Expired Token' });
    }
    req.user = decoded;
    // Map Entra ID app roles claim or default
    req.user.roles = decoded.roles || ['VIEWER'];
    next();
  });
}

// 4. Audit Log Middleware
function auditLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const clientIP = req.ip || req.connection.remoteAddress;
    const identity = req.userEmail || 'Anonymous';
    const tenant = req.tenantId || 'None';
    
    // Only log API operations, skip static assets or health checks
    if (req.originalUrl.startsWith('/api/')) {
      console.log(`[AUDIT] ${new Date().toISOString()} | Tenant: ${tenant} | IP: ${clientIP} | User: ${identity} | Method: ${req.method} | URL: ${req.originalUrl} | Status: ${res.statusCode} | Duration: ${duration}ms`);
    }
  });
  next();
}

// 5. Health Probe Route
app.get('/health', (req, res) => {
  res.json({
    status: "healthy",
    service: "backend",
    timestamp: new Date().toISOString()
  });
});

// 6. Base API routes registration
// Apply JWT Validation and Tenant Context Resolution to all API endpoints
const apiPrefix = '/api';

app.use(`${apiPrefix}/subscriptions`, validateJwt, tenantContext, auditLogger, require('./routes/subscriptions'));
app.use(`${apiPrefix}/resources`, validateJwt, tenantContext, auditLogger, require('./routes/resources'));
app.use(`${apiPrefix}/monitoring`, validateJwt, tenantContext, auditLogger, require('./routes/monitoring'));
app.use(`${apiPrefix}/actions`, validateJwt, tenantContext, auditLogger, require('./routes/actions'));
app.use(`${apiPrefix}/incidents`, validateJwt, tenantContext, auditLogger, require('./routes/incidents'));
app.use(`${apiPrefix}/notifications`, validateJwt, tenantContext, auditLogger, require('./routes/notifications'));
app.use(`${apiPrefix}/ai`, validateJwt, tenantContext, auditLogger, require('./routes/ai'));
app.use(`${apiPrefix}/reports`, validateJwt, tenantContext, auditLogger, require('./routes/reports'));
app.use(`${apiPrefix}/audit`, validateJwt, tenantContext, auditLogger, require('./routes/audit'));
app.use(`${apiPrefix}/sentinel`, validateJwt, tenantContext, auditLogger, require('./routes/sentinel'));
app.use(`${apiPrefix}/governance`, validateJwt, tenantContext, auditLogger, require('./routes/governance'));

// Compatibility Endpoints for Direct Verification Queries
app.get(`${apiPrefix}/security`, validateJwt, tenantContext, auditLogger, async (req, res) => {
  try {
    const db = await getDatabase();
    let subId = req.query.subscriptionId;
    let sub;
    if (subId) {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)', [req.tenantId, subId, subId]);
    } else {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? LIMIT 1', [req.tenantId]);
    }
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const { getSecureScore } = require('./services/defenderService');
    const score = await getSecureScore(req.tenantId, sub.id);
    res.json({ secureScore: score, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${apiPrefix}/cost`, validateJwt, tenantContext, auditLogger, async (req, res) => {
  try {
    const db = await getDatabase();
    let subId = req.query.subscriptionId;
    let sub;
    if (subId) {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)', [req.tenantId, subId, subId]);
    } else {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? LIMIT 1', [req.tenantId]);
    }
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const { getCostConsumption } = require('./services/monitoringService');
    const data = await getCostConsumption(req.tenantId, sub.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${apiPrefix}/backup`, validateJwt, tenantContext, auditLogger, async (req, res) => {
  try {
    const db = await getDatabase();
    let subId = req.query.subscriptionId;
    let sub;
    if (subId) {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? AND (id = ? OR subscription_id = ?)', [req.tenantId, subId, subId]);
    } else {
      sub = await db.get('SELECT * FROM azure_subscriptions WHERE tenant_id = ? LIMIT 1', [req.tenantId]);
    }
    if (!sub) return res.status(404).json({ error: 'Subscription not found or access denied.' });

    const { getBackupHealth } = require('./services/monitoringService');
    const data = await getBackupHealth(req.tenantId, sub.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Status check endpoint (Refactored to show tenant status details)
app.get('/api/status', validateJwt, tenantContext, async (req, res) => {
  try {
    const db = await getDatabase();
    
    const subsCount = await db.get('SELECT COUNT(*) as count FROM azure_subscriptions WHERE tenant_id = ?', [req.tenantId]);
    const resCount = await db.get(`
      SELECT COUNT(*) as count FROM resources r
      JOIN azure_subscriptions s ON r.subscription_id = s.id
      WHERE s.tenant_id = ?
    `, [req.tenantId]);
    
    res.json({
      tenantId: req.tenantId,
      authenticationStatus: 'Authenticated',
      lastRefreshTimestamp: new Date().toISOString(),
      registeredSubscriptions: subsCount.count,
      discoveredResourcesCount: resCount.count,
      liveConnectionStatus: 'Online',
      appServiceName: 'cloudops-saas-api',
      gatewayPort: PORT
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize Database & Start Server
async function startServer() {
  try {
    // Initialize database connection and schemas
    await getDatabase();
    console.log('[DB] SQLite database initialized successfully.');

    if (credentials) {
      https.createServer(credentials, app).listen(PORT, () => {
        console.log(`[SERVER] CloudOps Enterprise API running live over HTTPS on https://localhost:${PORT}`);
      });
    } else {
      // Always start HTTP server (useful for development without SSL)
      app.listen(PORT, () => {
        console.log(`[SERVER] CloudOps Enterprise API running live over HTTP on http://localhost:${PORT}`);
      });
    }
  } catch (error) {
    console.error('[SERVER] Critical startup error:', error);
    process.exit(1);
  }
}

startServer();
