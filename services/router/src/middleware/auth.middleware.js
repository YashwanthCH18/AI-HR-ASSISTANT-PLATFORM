const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { AuthSession } = require('../models');
const { Op } = require('sequelize');

/**
 * Middleware to validate JWT from request headers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateJWT = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please log in.'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided.'
      });
    }

    // Verify token using our JWT secret
    const decoded = jwt.verify(token, config.jwt.secret);

    // Extract user role and organization_id
    const { role, organization_id, user_id } = decoded;

    if (!role || !organization_id) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token structure. Missing required claims.'
      });
    }

    // Check if session exists in database
    try {
      const session = await AuthSession.findOne({
        where: {
          token: token,
          user_id: user_id,
          expires_at: {
            [Op.gt]: new Date() // Token should not be expired
          }
        }
      });

      if (!session) {
        return res.status(401).json({
          status: 'error',
          message: 'Session expired or invalid. Please log in again.'
        });
      }

      // Update last activity
      await session.update({ last_activity: new Date() });
    } catch (err) {
      console.error('Error verifying session:', err);
      return res.status(503).json({ status: 'error', message: 'Authentication service unavailable.' });
    }

    // Attach user data to request for downstream use
    req.user = {
      id: user_id,
      role,
      organizationId: organization_id,
      token // Pass the token for forwarding to backend services
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. Please log in again.'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired. Please log in again.'
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Authentication error.'
    });
  }
};

/**
 * Middleware to restrict access based on user roles
 * @param {Array} roles - Array of allowed roles
 */
const restrictTo = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to perform this action.'
      });
    }
    next();
  };
};

module.exports = {
  authenticateJWT,
  restrictTo
};
