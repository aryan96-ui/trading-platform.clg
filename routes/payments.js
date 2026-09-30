// routes/payments.js - Razorpay Payment Flows, Verification & Premium Activation
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const User = require('../models/User');
const Payment = require('../src/models/Payment');
const { inMemoryUsers } = require('../middlewares/auth');

// Initialize Razorpay client
let razorpay = null;
const keyId = process.env.RAZORPAY_KEY_ID || '';
const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

if (keyId && keySecret) {
    try {
        razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret
        });
        console.log('✅ Razorpay initialized successfully');
    } catch (err) {
        console.error('⚠️  Failed to initialize Razorpay:', err.message);
    }
} else {
    console.log('⚠️  Razorpay credentials not set; running in demo payment mode');
}

// In-memory payment ledger fallback
const inMemoryPayments = [];

// POST /create-order or /api/create-order
router.post('/create-order', async (req, res) => {
    try {
        const { amount, currency = 'INR', receipt } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valid amount in paise is required' });
        }

        if (razorpay) {
            const options = {
                amount: Math.round(amount), // e.g. ₹499 = 49900 paise
                currency,
                receipt: receipt || `receipt_${Date.now()}`,
                payment_capture: 1
            };

            const order = await razorpay.orders.create(options);
            return res.json({
                id: order.id,
                amount: order.amount,
                currency: order.currency
            });
        }

        // Simulated Mock Order for development/offline mode
        const mockOrder = {
            id: `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            amount: Math.round(amount),
            currency
        };
        return res.json(mockOrder);
    } catch (err) {
        console.error('Create Order Error:', err);
        return res.status(500).json({ error: 'Payment gateway error: ' + err.message });
    }
});

// POST /verify-payment or /api/verify-payment
router.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, email, amount } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'User email is required' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Validate signature when live Razorpay secret is present
        if (keySecret && razorpay_order_id && razorpay_payment_id && razorpay_signature) {
            const generated_signature = crypto
                .createHmac('sha256', keySecret)
                .update(razorpay_order_id + '|' + razorpay_payment_id)
                .digest('hex');

            if (generated_signature !== razorpay_signature) {
                return res.status(400).json({ success: false, message: 'Signature verification failed' });
            }
        }

        // Record Payment
        const paymentRecord = {
            userId: normalizedEmail,
            paymentId: razorpay_payment_id || `pay_mock_${Date.now()}`,
            orderId: razorpay_order_id || `order_mock_${Date.now()}`,
            amount: amount || 499,
            status: 'SUCCESS',
            date: new Date()
        };

        if (mongoose.connection.readyState === 1) {
            try {
                await Payment.create(paymentRecord);
            } catch (e) {
                console.error('Payment Mongo save warning:', e.message);
            }
        }
        inMemoryPayments.push(paymentRecord);

        // Upgrade User to Premium (both MongoDB & In-Memory)
        if (mongoose.connection.readyState === 1) {
            await User.updateOne(
                { email: normalizedEmail },
                { isPremium: true, plan: 'PRO', tierLevel: 'pro' }
            );
        }

        // In-memory upgrade
        let memUser = inMemoryUsers.get(normalizedEmail);
        if (memUser) {
            memUser.isPremium = true;
            memUser.plan = 'PRO';
            memUser.tierLevel = 'pro';
            inMemoryUsers.set(normalizedEmail, memUser);
        } else {
            inMemoryUsers.set(normalizedEmail, {
                email: normalizedEmail,
                name: 'Pro Trader',
                password: '',
                balance: 100000,
                portfolio: {},
                isPremium: true,
                tierLevel: 'pro',
                plan: 'PRO'
            });
        }

        console.log(`🌟 User ${normalizedEmail} successfully upgraded to PREMIUM / PRO tier`);

        return res.json({
            success: true,
            message: 'Payment verified and Pro plan activated successfully',
            isPremium: true,
            tierLevel: 'pro',
            plan: 'PRO'
        });
    } catch (err) {
        console.error('Verify Payment Error:', err);
        return res.status(500).json({ success: false, message: 'Payment verification failed: ' + err.message });
    }
});

// POST /payment or /api/payment - Direct Wallet Deposit
router.post('/payment', async (req, res) => {
    try {
        const email = req.user?.email || req.body.email || req.headers['x-user-email'];
        const amount = parseFloat(req.body.amount);

        if (!email || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid email and positive deposit amount required' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        let newBalance = 100000;

        if (mongoose.connection.readyState === 1) {
            const user = await User.findOne({ email: normalizedEmail });
            if (user) {
                user.balance = Number((user.balance + amount).toFixed(2));
                await user.save();
                newBalance = user.balance;
            }
        }

        const memUser = inMemoryUsers.get(normalizedEmail);
        if (memUser) {
            memUser.balance = Number(((memUser.balance || 100000) + amount).toFixed(2));
            inMemoryUsers.set(normalizedEmail, memUser);
            newBalance = memUser.balance;
        }

        return res.json({
            success: true,
            message: `Successfully deposited ₹${amount.toLocaleString()} into trading account.`,
            newBalance
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
