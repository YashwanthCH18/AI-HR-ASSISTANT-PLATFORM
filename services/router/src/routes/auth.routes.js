const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticateJWT } = require('../middleware/auth.middleware');

const router = express.Router();

// Public routes
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/logout', authenticateJWT, authController.logout);

// Protected routes
router.get('/me', authenticateJWT, authController.getCurrentUser);
router.get('/verify-token', authenticateJWT, authController.verifyToken);

module.exports = router;
