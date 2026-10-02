const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Import config and utilities
const config = require('./config/config');
const { formatError } = require('./utils');

// Import database models
require('./models');

// Import routes
const authRoutes = require('./routes/auth.routes');
const routerRoutes = require('./routes/router.routes');

// Initialize Express app
const app = express();
const PORT = config.server.port;

// Middleware
app.use(helmet());  // Security headers
app.use(morgan('dev'));  // Request logging
app.use(express.json());  // Parse JSON bodies
app.use(express.urlencoded({ extended: true }));  // Parse URL-encoded bodies
app.use(cookieParser());  // Parse cookies

// CORS configuration
const allowedOrigins = config.cors.allowedOrigins;
app.use(cors({
  origin: allowedOrigins, // Use the configured list of origins
  credentials: true
}));

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Router service is running',
    timestamp: new Date().toISOString(),
    environment: config.server.nodeEnv
  });
});

// Routes
app.use('/auth', authRoutes);
app.use('/', routerRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`Error: ${err.message}`);

  // Log routing errors for debugging
  if (err.isRoutingError) {
    console.error(`Routing Error: ${err.details}`);
  }

  res.status(err.statusCode || 500).json(formatError(err));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json(formatError(
    new Error(`Cannot find ${req.originalUrl} on this server`),
    'Route not found'
  ));
});

// Start server if not imported
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Router service running on port ${PORT} in ${config.server.nodeEnv} mode`);
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! Shutting down...');
    console.error(err.name, err.message);
    process.exit(1);
  });
}

// Export app for serverless use
module.exports = app;
