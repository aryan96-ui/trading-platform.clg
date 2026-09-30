// middlewares/rateLimiter.js - Express Rate Limiting for Security
const rateLimit = require('express-rate-limit');
const config = require('../config');

// Standard API rate limiter (prevents API flooding)
const apiLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again after 15 minutes.'
    }
});

// Stricter limiter for authentication attempts (prevents brute-force)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many login attempts. Please try again in 15 minutes.'
    }
});

// Trading limiter to prevent rapid duplicate executions
const tradeLimiter = rateLimit({
    windowMs: 10 * 1000, // 10 seconds
    max: 30,             // max 30 orders per 10 seconds
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Order placement rate limit reached. Please throttle your trades.'
    }
});

module.exports = {
    apiLimiter,
    authLimiter,
    tradeLimiter
};
