// middlewares/auth.js - JWT Authentication & Tier Validation Middleware
const jwt = require('jsonwebtoken');
const config = require('../config');

// In-memory user fallback storage reference
const inMemoryUsers = new Map();

// Helper to generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        {
            email: user.email,
            tierLevel: user.tierLevel || (user.isPremium ? 'pro' : 'free'),
            isPremium: Boolean(user.isPremium)
        },
        config.JWT_SECRET,
        { expiresIn: config.JWT_EXPIRES_IN }
    );
};

// Authenticate request token with fallback support for session headers
const authenticateToken = (req, res, next) => {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.headers['x-access-token']) {
        token = req.headers['x-access-token'];
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, config.JWT_SECRET);
            req.user = decoded;
            return next();
        } catch (err) {
            // Invalid JWT token
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }
    }

    // Default guest session for open exploration
    req.user = null;
    next();
};

// Guard: Require authenticated user
const requireAuth = (req, res, next) => {
    if (!req.user || !req.user.email) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Please login with a valid JWT token or session.'
        });
    }
    next();
};

// Guard: Require Premium (Pro or Enterprise)
const requirePremium = async (req, res, next) => {
    const email = req.user?.email || req.headers['x-user-email'] || req.query.email || req.body?.email || 'demo@college.com';
    if (!email) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Please log in to access this feature.',
            requiresUpgrade: true
        });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let isPremium = false;
    let tierLevel = 'free';

    try {
        const mongoose = require('mongoose');
        const User = require('../models/User');
        if (mongoose.connection.readyState === 1) {
            const user = await User.findOne({ email: normalizedEmail }).select('isPremium tierLevel plan');
            if (user && (user.isPremium || user.tierLevel === 'pro' || user.tierLevel === 'enterprise' || user.plan === 'PRO')) {
                isPremium = true;
                tierLevel = user.tierLevel || 'pro';
            }
        }
    } catch (e) {
        // Continue to check in-memory
    }

    // Check in-memory store if not confirmed yet
    if (!isPremium && inMemoryUsers.has(normalizedEmail)) {
        const memUser = inMemoryUsers.get(normalizedEmail);
        if (memUser && (memUser.isPremium || memUser.tierLevel === 'pro' || memUser.tierLevel === 'enterprise' || memUser.plan === 'PRO')) {
            isPremium = true;
            tierLevel = memUser.tierLevel || 'pro';
        }
    }

    // Check req.user claims from token
    if (!isPremium && req.user && (req.user.isPremium || req.user.tierLevel === 'pro' || req.user.tierLevel === 'enterprise')) {
        isPremium = true;
        tierLevel = req.user.tierLevel || 'pro';
    }

    if (!isPremium) {
        return res.status(403).json({
            success: false,
            message: 'Premium subscription required. Upgrade to Pro or Enterprise to access AI Copilot and advanced analytics.',
            requiresUpgrade: true
        });
    }

    req.user = req.user || { email: normalizedEmail, isPremium: true, tierLevel };
    next();
};

module.exports = {
    generateToken,
    authenticateToken,
    requireAuth,
    requirePremium,
    inMemoryUsers
};
