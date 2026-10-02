const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createPool } = require('../../shared/db');
const { createApp } = require('./app');

const pool = createPool(mysql);
const model = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: 'gemini-2.0-flash' })
  : null;
module.exports = createApp({ pool, jwt, jwtSecret: process.env.JWT_SECRET, model });
