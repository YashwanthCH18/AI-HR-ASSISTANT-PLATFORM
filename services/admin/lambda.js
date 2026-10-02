const serverless = require('serverless-http');
const app = require('./runtime');
module.exports.handler = serverless(app);
