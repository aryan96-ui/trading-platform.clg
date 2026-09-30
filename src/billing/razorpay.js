/**
 * ProTrader — Billing (Razorpay)
 *
 * Ported out of the legacy server so payments became a module the single entry
 * point composes, instead of a second express app that owned its own user store
 * and wrote premium flags into a Map no other screen could see.
 *
 * Plan activation now goes through the account service, so the terminal reads
 * the same premium flag the payment flow just set.
 */

const crypto = require('crypto');
const Payment = require('../models/Payment');

module.exports = function createBilling({ accounts }) {
    let razorpay = null;
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        try {
            const Razorpay = require('razorpay');
            razorpay = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET
            });
        } catch (e) {
            razorpay = null;
        }
    }

    /** POST /api/create-order — create a Razorpay order for a plan. */
    const createOrder = async (req, res) => {
        if (!razorpay) {
            return res.status(503).json({
                error: 'Payment gateway not configured. Please add Razorpay credentials to .env'
            });
        }
        const { amount, currency = 'INR', receipt } = req.body || {};
        if (!amount) return res.status(400).json({ error: 'amount is required' });
        try {
            const order = await razorpay.orders.create({
                amount,
                currency,
                receipt: receipt || `receipt_${Date.now()}`,
                payment_capture: 1
            });
            res.json({ id: order.id, amount: order.amount, currency: order.currency, receipt: order.receipt });
        } catch (err) {
            res.status(500).json({ error: 'Failed to create order' });
        }
    };

    /**
     * POST /api/verify-payment — verify the Razorpay signature, record the
     * payment and activate the plan. The signature check is the only thing that
     * makes this trustworthy, so it runs before anything is written.
     */
    const verifyPayment = async (req, res) => {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, email, amount } = req.body || {};
        if (!process.env.RAZORPAY_KEY_SECRET) {
            return res.status(503).json({ success: false, message: 'Payment gateway not configured' });
        }
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
        }

        const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');
        if (expected !== razorpay_signature) {
            return res.json({ success: false, message: 'Signature verification failed' });
        }

        // The ledger row is best-effort; plan activation below is the outcome
        // the caller depends on. Only attempt it when mongoose is connected,
        // because an unconnected model would buffer and never resolve.
        if (accounts.persistent) {
            try {
                await Payment.create({
                    userId: email,
                    paymentId: razorpay_payment_id,
                    orderId: razorpay_order_id,
                    amount,
                    status: 'SUCCESS'
                });
            } catch (e) { /* ledger write is best effort */ }
        }

        await accounts.setPremium(email, 'pro');
        res.json({ success: true, message: 'Payment verified and plan activated' });
    };

    return { createOrder, verifyPayment, isConfigured: () => !!razorpay };
};
