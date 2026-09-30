// models/User.js - Production User Schema with Security & Balance fields
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    name: { type: String, default: 'ProTrader Trader' },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 100000 },
    portfolio: { type: Object, default: {} },
    isPremium: { type: Boolean, default: false },
    tierLevel: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    plan: { type: String, default: 'FREE' },
    stripeCustomerId: { type: String },
    subscriptionId: { type: String },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now }
});

// Password verification method
UserSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) return false;
    // Check if plain match (for legacy demo passwords) or bcrypt hash
    if (this.password === candidatePassword) return true;
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (e) {
        return false;
    }
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
