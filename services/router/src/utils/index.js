/**
 * Formats server error responses consistently
 * @param {Object} error - Error object
 * @param {String} defaultMessage - Default message if error doesn't have one
 * @returns {Object} Formatted error response
 */
const formatError = (error, defaultMessage = 'An error occurred') => {
  return {
    status: 'error',
    message: error.message || defaultMessage,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  };
};

/**
 * Formats success responses consistently
 * @param {String} message - Success message
 * @param {Object|Array} data - Response data
 * @returns {Object} Formatted success response
 */
const formatSuccess = (message, data = null) => {
  const response = {
    status: 'success',
    message
  };

  if (data) {
    response.data = data;
  }

  return response;
};

/**
 * Logs requests for debugging
 * @param {Object} req - Express request object
 * @param {String} destination - Where request is being routed to
 * @returns {Void}
 */
const logRequest = (req, destination) => {
  console.log(`
    ---- REQUEST ROUTING LOG ----
    Timestamp: ${new Date().toISOString()}
    Method: ${req.method}
    URL: ${req.originalUrl}
    User Role: ${req.user?.role || 'unknown'}
    Organization ID: ${req.user?.organizationId || 'unknown'}
    Destination: ${destination}
    ----------------------------
  `);
};

module.exports = {
  formatError,
  formatSuccess,
  logRequest
};