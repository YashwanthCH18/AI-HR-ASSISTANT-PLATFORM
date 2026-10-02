const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const { formatSuccess, formatError } = require('../utils');
const { User, AuthSession, sequelize } = require('../models');

/**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.signup = async (req, res, next) => {
  if (process.env.ENABLE_PUBLIC_SIGNUP !== 'true') {
    return res.status(403).json(formatError(new Error('Public signup is disabled')));
  }
  let transaction;
  try {
    const { email, password, firstName, lastName, role, organizationId, department, location } = req.body;

    // Validate input
    if (!email || !password || !firstName || !lastName || !role || !organizationId) {
      return res.status(400).json(
        formatError(new Error('Please provide all required fields (email, password, firstName, lastName, role, organizationId)'))
      );
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json(formatError(new Error('An account with this email already exists.')));
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    transaction = await sequelize.transaction();
    // Create new user in the database
    const newUser = await User.create({
      user_id: `${organizationId.substring(0, 3).toUpperCase()}_${Date.now()}`, // Simple unique ID
      organization_id: organizationId,
      first_name: firstName,
      last_name: lastName,
      email: email,
      password_hash: hashedPassword,
      role: role,
      date_of_joining: new Date(),
      department: department,
      location: location
    }, { transaction });

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: newUser.user_id,
        role: newUser.role,
        organization_id: newUser.organization_id,
        email: newUser.email
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Calculate token expiry time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Create a new auth session
    await AuthSession.create({
      session_id: uuidv4(),
      user_id: newUser.user_id,
      organization_id: newUser.organization_id,
      token: token,
      expires_at: expiresAt
    }, { transaction });

    // Commit the transaction
    await transaction.commit();

    // Set token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: config.server.nodeEnv === 'production',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.status(201).json(
      formatSuccess('User created successfully', {
        user: {
          id: newUser.user_id,
          email: newUser.email,
          firstName: newUser.first_name,
          lastName: newUser.last_name,
          role: newUser.role,
          organizationId: newUser.organization_id
        },
        token
      })
    );
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};

/**
 * Login user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.login = async (req, res, next) => {
  let transaction;
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json(formatError(new Error('Please provide email and password')));
    }

    // Find user in the database
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json(formatError(new Error('Invalid credentials')));
    }

    // Verify password
    const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordCorrect) {
      return res.status(401).json(formatError(new Error('Invalid credentials')));
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role,
        organization_id: user.organization_id,
        email: user.email
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    transaction = await sequelize.transaction();
    // Create or update auth session
    await AuthSession.create({
      session_id: uuidv4(),
      user_id: user.user_id,
      organization_id: user.organization_id,
      token: token,
      expires_at: expiresAt
    }, { transaction });

    await transaction.commit();

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.server.nodeEnv === 'production',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.status(200).json(
      formatSuccess('Logged in successfully', {
        user: {
          id: user.user_id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          organizationId: user.organization_id
        },
        token
      })
    );
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};

/**
 * Logout user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.logout = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];

      await AuthSession.destroy({ where: { token: token } });
    }

    res.cookie('token', '', {
      httpOnly: true,
      expires: new Date(0)
    });

    res.status(200).json(
      formatSuccess('Logged out successfully')
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user info
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getCurrentUser = (req, res) => {
  res.status(200).json(
    formatSuccess('User fetched successfully', {
      user: req.user
    })
  );
};

/**
 * Verify token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.verifyToken = async (req, res, next) => {
  try {
    if (req.user && req.user.token) {
      await AuthSession.update(
        { last_activity: new Date() },
        { where: { token: req.user.token } }
      );
    }

    res.status(200).json(
      formatSuccess('Token is valid', {
        user: req.user
      })
    );
  } catch (error) {
    next(error);
  }
};
