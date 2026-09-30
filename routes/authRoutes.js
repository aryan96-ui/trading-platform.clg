// routes/authRoutes.js - Authentication & JWT Endpoints
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { generateToken, inMemoryUsers, authenticateToken, requireAuth } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');

// In-memory demo user seeding
if (!inMemoryUsers.has('demo@college.com')) {
    inMemoryUsers.set('demo@college.com', {
        email: 'demo@college.com',
        password: 'password123',
        balance: 100000,
        portfolio: {},
        isPremium: true,
        tierLevel: 'pro'
    });
}

// POST /api/register or /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if MongoDB is connected
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
                tierLevel: 'free'
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
                    portfolio: newUser.portfolio
                }
            });
        } else {
            // In-Memory Mode Fallback
            if (inMemoryUsers.has(normalizedEmail)) {
                return res.status(409).json({ success: false, message: 'User already exists' });
            }

            const userObj = {
                name: name || 'ProTrader Trader',
                email: normalizedEmail,
                password: await bcrypt.hash(password, 10),
                balance: 100000,
                portfolio: {},
                isPremium: false,
                tierLevel: 'free'
            };
            inMemoryUsers.set(normalizedEmail, userObj);

            const token = generateToken(userObj);
            return res.json({
                success: true,
                message: 'Account created successfully (In-Memory)',
                token,
                user: {
                    name: userObj.name,
                    email: userObj.email,
                    balance: userObj.balance,
                    isPremium: userObj.isPremium,
                    tierLevel: userObj.tierLevel,
                    portfolio: userObj.portfolio
                }
            });
        }
    } catch (err) {
        console.error('Registration Error:', err);
        return res.status(500).json({ success: false, message: 'Registration failed: ' + err.message });
    }
});

// POST /api/login or /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        if (mongoose.connection.readyState === 1) {
            const user = await User.findOne({ email: normalizedEmail });
            if (!user) {
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }

            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }

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
                    portfolio: user.portfolio
                }
            });
        } else {
            // In-Memory Mode
            const user = inMemoryUsers.get(normalizedEmail);
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }

            const token = generateToken(user);
            return res.json({
                success: true,
                token,
                user: {
                    name: user.name || 'ProTrader Demo',
                    email: user.email,
                    balance: user.balance,
                    isPremium: user.isPremium,
                    tierLevel: user.tierLevel,
                    portfolio: user.portfolio
                }
            });
        }
    } catch (err) {
        console.error('Login Error:', err);
        return res.status(500).json({ success: false, message: 'Login failed: ' + err.message });
    }
});

// GET /api/auth/me
router.get('/me', authenticateToken, requireAuth, async (req, res) => {
    try {
        const email = req.user.email;
        let userData = null;

        if (mongoose.connection.readyState === 1) {
            userData = await User.findOne({ email }).select('-password');
        } else {
            userData = inMemoryUsers.get(email);
        }

        if (!userData) {
            return res.status(404).json({ success: false, message: 'User profile not found' });
        }

        return res.json({ success: true, user: userData });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
