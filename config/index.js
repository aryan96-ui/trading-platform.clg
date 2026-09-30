// config/index.js - Centralized Application Configuration
require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3000,
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/trading',
    JWT_SECRET: process.env.JWT_SECRET || 'protrader_production_jwt_secret_key_2026_!@#$',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    WHITE_LABEL_API_KEY: process.env.WHITE_LABEL_API_KEY || 'protrader_whitelabel_default_key',
    RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: 200,          // 200 requests per 15 minutes
    CACHE_TIMEOUT_MS: 30000               // 30 seconds market cache
};
