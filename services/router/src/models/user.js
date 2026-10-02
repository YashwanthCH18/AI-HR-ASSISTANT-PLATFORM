const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  user_id: {
    type: DataTypes.STRING(50),
    primaryKey: true,
    allowNull: false
  },
  organization_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    references: {
      model: 'Organizations',
      key: 'organization_id'
    }
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  role: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  manager_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    references: {
      model: 'Users',
      key: 'user_id'
    }
  },
  date_of_joining: {
    type: DataTypes.DATE,
    allowNull: false
  },
  department: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  location: {
    type: DataTypes.STRING(100),
    allowNull: true
  }
}, {
  tableName: 'Users',
  timestamps: false
});

module.exports = User;