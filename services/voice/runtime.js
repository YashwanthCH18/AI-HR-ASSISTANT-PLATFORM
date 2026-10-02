const jwt = require('jsonwebtoken');
const { createApp } = require('./app');
module.exports = createApp({ jwt, jwtSecret: process.env.JWT_SECRET,
  sarvamKey: process.env.SARVAM_API_KEY, routerBaseUrl: process.env.ROUTER_BASE_URL });
