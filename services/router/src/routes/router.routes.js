const express = require('express');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { routeRequest } = require('../middleware/router.middleware');

const router = express.Router();

router.all(/^\/(admin|user)\/.*$/, authenticateJWT, routeRequest);

module.exports = router;
