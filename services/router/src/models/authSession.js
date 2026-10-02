const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuthSession = sequelize.define('AuthSession', {
  session_id: {
    type: DataTypes.STRING(255),
    primaryKey: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    references: {
      model: 'Users',
      key: 'user_id'
    }
  },
  organization_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    references: {
      model: 'Organizations',
      key: 'organization_id'
    }
  },
  token: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  last_activity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'AuthSessions',
  timestamps: false,
  indexes: [
    {
      name: 'idx_auth_sessions_token',
      fields: ['token']
    },
    {
      name: 'idx_auth_sessions_user',
      fields: ['user_id']
    }
  ]
});

module.exports = AuthSession;