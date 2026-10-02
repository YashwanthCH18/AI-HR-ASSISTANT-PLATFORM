const sequelize = require('../config/database');
const AuthSession = require('./authSession');
const User = require('./user');

// Define associations
User.hasMany(AuthSession, { foreignKey: 'user_id' });
AuthSession.belongsTo(User, { foreignKey: 'user_id' });

// Check if we need to sync the models with the database
// For production, you'd usually handle migrations separately
const syncModels = async () => {
  try {
    // This creates the table if it doesn't exist (won't modify existing tables)
    await sequelize.sync({ alter: false });
    console.log('Models synchronized with database');
  } catch (error) {
    console.error('Error synchronizing models:', error);
  }
};

// Run sync during startup
// In a real app, you might only do this in development
if (process.env.NODE_ENV === 'development') {
  syncModels();
}

// Export all models
module.exports = {
  sequelize,
  AuthSession,
  User
};