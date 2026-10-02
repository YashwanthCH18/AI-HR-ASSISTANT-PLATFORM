function authenticate(jwt, secret, allowedRoles) {
  if (!secret) throw new Error('JWT_SECRET is required');
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Bearer token required' });
    try {
      const claims = jwt.verify(header.slice(7), secret);
      const role = String(claims.role || '').toLowerCase();
      if (!claims.user_id || !claims.organization_id || !role) {
        return res.status(401).json({ error: 'Token is missing required claims' });
      }
      if (!allowedRoles.includes(role)) return res.status(403).json({ error: 'Role is not allowed' });
      req.user = { id: claims.user_id, organizationId: claims.organization_id, role };
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { authenticate, asyncRoute };
