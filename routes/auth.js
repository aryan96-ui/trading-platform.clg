// routes/auth.js - Authentication & User State Management
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { generateToken, inMemoryUsers, authenticateToken, requireAuth } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');

// Seed default demo user in memory if not already seeded
if (!inMemoryUsers.has('demo@college.com')) {
    inMemoryUsers.set('demo@college.com', {
        email: 'demo@college.com',
        password: 'password123',
        name: 'Demo Trader',
        balance: 100000,
        portfolio: {},
        isPremium: true,
        tierLevel: 'pro',
        plan: 'PRO'
    });
}

// POST /register
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // 1. Try MongoDB if connected
        if (mongoose.connection.readyState === 1) {
            const existing = await User.findOne({ email: normalizedEmail });
            if (existing) {
                return res.status(409).json({ success: false, message: 'User already exists with this email' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await User.create({
                name: name || 'ProTrader Trader',
                email: normalizedEmail,
                password: hashedPassword,
                balance: 100000,
                portfolio: {},
                isPremium: false,
                tierLevel: 'free',
                plan: 'FREE'
            });

            // Also keep in-memory cache in sync
            inMemoryUsers.set(normalizedEmail, {
                email: newUser.email,
                name: newUser.name,
                password: hashedPassword,
                balance: newUser.balance,
                portfolio: newUser.portfolio,
                isPremium: false,
                tierLevel: 'free',
                plan: 'FREE'
            });

            const token = generateToken(newUser);
            return res.json({
                success: true,
                message: 'Account created successfully',
                token,
                user: {
                    name: newUser.name,
                    email: newUser.email,
                    balance: newUser.balance,
                    isPremium: newUser.isPremium,
                    tierLevel: newUser.tierLevel,
                    plan: newUser.plan,
                    portfolio: newUser.portfolio
                }
            });
        }

        // 2. In-Memory Mode Fallback
        if (inMemoryUsers.has(normalizedEmail)) {
            return res.status(409).json({ success: false, message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userObj = {
            name: name || 'ProTrader Trader',
            email: normalizedEmail,
            password: hashedPassword,
            balance: 100000,
            portfolio: {},
            isPremium: false,
            tierLevel: 'free',
            plan: 'FREE'
        };
        inMemoryUsers.set(normalizedEmail, userObj);

        const token = generateToken(userObj);
        return res.json({
            success: true,
            message: 'Account created successfully (In-Memory Mode)',
            token,
            user: {
                name: userObj.name,
                email: userObj.email,
                balance: userObj.balance,
                isPremium: userObj.isPremium,
                tierLevel: userObj.tierLevel,
                plan: userObj.plan,
                portfolio: userObj.portfolio
            }
        });
    } catch (err) {
        console.error('Registration Error:', err);
        return res.status(500).json({ success: false, message: 'Registration failed: ' + err.message });
    }
});

// POST /login
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // 1. Try MongoDB
        if (mongoose.connection.readyState === 1) {
            const user = await User.findOne({ email: normalizedEmail });
            if (user) {
                const isMatch = await user.comparePassword(password);
                if (isMatch) {
                    const token = generateToken(user);
                    return res.json({
                        success: true,
                        token,
                        user: {
                            name: user.name,
                            email: user.email,
                            balance: user.balance,
                            isPremium: user.isPremium,
                            tierLevel: user.tierLevel,
                            plan: user.plan,
                            portfolio: user.portfolio
                        }
                    });
                }
            }
        }

        // 2. Fallback to In-Memory store
        const memUser = inMemoryUsers.get(normalizedEmail);
        if (memUser) {
            const isMatch = memUser.password === password || (await bcrypt.compare(password, memUser.password).catch(() => false));
            if (isMatch) {
                const token = generateToken(memUser);
                return res.json({
                    success: true,
                    token,
                    user: {
                        name: memUser.name || 'ProTrader Trader',
                        email: memUser.email,
                        balance: memUser.balance,
                        isPremium: Boolean(memUser.isPremium),
                        tierLevel: memUser.tierLevel || 'free',
                        plan: memUser.plan || 'FREE',
                        portfolio: memUser.portfolio || {}
                    }
                });
            }
        }

        return res.status(401).json({ success: false, message: 'Invalid email or password' });
    } catch (err) {
        console.error('Login Error:', err);
        return res.status(500).json({ success: false, message: 'Login failed: ' + err.message });
    }
});

// GET /me
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const email = req.user?.email || req.headers['x-user-email'] || req.query.email;
        if (!email) {
            return res.status(401).json({ success: false, message: 'Unauthenticated' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        let userData = null;

        if (mongoose.connection.readyState === 1) {
            userData = await User.findOne({ email: normalizedEmail }).select('-password');
        }

        if (!userData) {
            const memUser = inMemoryUsers.get(normalizedEmail);
            if (memUser) {
                const { password, ...safe } = memUser;
                userData = safe;
            }
        }

        if (!userData) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.json({ success: true, user: userData });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// POST /logout
router.post('/logout', (req, res) => {
    return res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
