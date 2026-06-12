// ============================================================
// RBAC Authorization Middleware
// ============================================================

// Role hierarchy map (lower index = more privileges)
const ROLE_HIERARCHY = ['OWNER', 'ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER'];

/**
 * Authorize roles for a request.
 * Pass the list of roles that are allowed to access this resource.
 * Example: authorizeRoles('OWNER', 'ADMIN')
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(403).json({ error: 'Access Denied: No user role resolved in tenant context' });
    }

    const hasRole = allowedRoles.some(r => r.toUpperCase() === req.userRole.toUpperCase());
    if (!hasRole) {
      return res.status(403).json({
        error: `Access Denied: Required role(s) [${allowedRoles.join(', ')}] not met. Your role: [${req.userRole}]`
      });
    }

    next();
  };
}

/**
 * Authorize minimum role hierarchy access.
 * Checks if the user's role has at least the permission level of the target role.
 * Example: authorizeMinRole('OPERATOR') allows OWNER, ADMIN, and OPERATOR.
 */
function authorizeMinRole(minRole) {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(403).json({ error: 'Access Denied: No user role resolved in tenant context' });
    }

    const minIndex = ROLE_HIERARCHY.indexOf(minRole.toUpperCase());
    const userIndex = ROLE_HIERARCHY.indexOf(req.userRole.toUpperCase());

    if (minIndex === -1 || userIndex === -1 || userIndex > minIndex) {
      return res.status(403).json({
        error: `Access Denied: Minimum role of [${minRole}] required. Your role: [${req.userRole}]`
      });
    }

    next();
  };
}

module.exports = {
  authorizeRoles,
  authorizeMinRole
};
