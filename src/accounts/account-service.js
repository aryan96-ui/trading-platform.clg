/**
 * ProTrader — Account Service
 *
 * The single owner of *identity* for the whole platform: who exists, their
 * password, and their premium tier.
 *
 * It deliberately does NOT own balance, orders, positions or P&L — those belong
 * to the paper trading service (src/trading/paper-trading.js), and every balance
 * a caller needs is read from there. One owner per fact is what removes the
 * mirrored `users` Map that used to let the legacy half and the intelligence
 * half of the app disagree about the same account.
 *
 * Storage is MongoDB when MONGODB_URI is configured and in-memory otherwise, so
 * the platform runs with no external dependency in demo mode and becomes
 * durable the moment a URI is supplied.
 */

const DEMO_EMAIL = 'demo@college.com';
const DEMO_PASSWORD = 'password123';

class AccountService {
    constructor({ mongoUri = process.env.MONGODB_URI || null, seed = true } = {}) {
        this.mongoUri = mongoUri;
        this.seed = seed;
        this.persistent = false;
        this.reason = 'not initialised';
        this.memory = new Map();
        this.User = null;
        this._ready = null;
    }

    /**
     * Idempotent boot. Never throws: a failed connection degrades to the
     * in-memory store and records why, exactly as the legacy server did.
     * Every read and write awaits this, so a request that arrives before the
     * connection resolves still sees a consistent store.
     */
    ready() {
        if (!this._ready) this._ready = this._init();
        return this._ready;
    }

    async _init() {
        if (!this.mongoUri) {
            this.reason = 'no MONGODB_URI configured';
            this._seedMemory();
            return this;
        }
        try {
            const mongoose = require('mongoose');
            const schema = new mongoose.Schema({
                email: { type: String, required: true, unique: true },
                password: { type: String, required: true },
                isPremium: { type: Boolean, default: false },
                tierLevel: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' }
            });
            // Reuse an existing registration so this module can never throw
            // OverwriteModelError — the legacy server defined this model twice,
            // with different shapes, in two different files.
            this.User = mongoose.models.User || mongoose.model('User', schema);
            await mongoose.connect(this.mongoUri, {
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                family: 4
            });
            this.persistent = true;
            this.reason = 'connected';
            if (this.seed) await this._seedMongo();
        } catch (err) {
            this.persistent = false;
            this.reason = err.message;
            this._seedMemory();
        }
        return this;
    }

    _demoIdentity() {
        return { email: DEMO_EMAIL, password: DEMO_PASSWORD, isPremium: false, tierLevel: 'free' };
    }

    _seedMemory() {
        if (!this.seed || this.memory.has(DEMO_EMAIL)) return;
        this.memory.set(DEMO_EMAIL, this._demoIdentity());
    }

    async _seedMongo() {
        try {
            const existing = await this.User.findOne({ email: DEMO_EMAIL });
            if (!existing) await this.User.create(this._demoIdentity());
        } catch (e) {
            // Seeding is best-effort; a failure here must not stop the server.
        }
    }

    // ========================================
    // READS
    // ========================================

    /** Resolve an identity, or null. Never invents one. */
    async find(email) {
        if (!email) return null;
        await this.ready();
        if (this.persistent && this.User) {
            try {
                const doc = await this.User.findOne({ email });
                if (!doc) return null;
                return {
                    email: doc.email,
                    password: doc.password,
                    isPremium: !!doc.isPremium,
                    tierLevel: doc.tierLevel || 'free'
                };
            } catch (e) {
                return null;
            }
        }
        return this.memory.get(email) || null;
    }

    async isPremium(email) {
        const identity = await this.find(email);
        return !!(identity && identity.isPremium);
    }

    /** Storage provenance, for the status strip and the run doc. */
    describe() {
        return this.persistent
            ? { storage: 'mongodb', persistent: true, reason: 'connected' }
            : { storage: 'memory', persistent: false, reason: this.reason };
    }

    // ========================================
    // WRITES
    // ========================================

    async register(email, password) {
        if (!email || !password) return { success: false, message: 'Email and password required' };
        await this.ready();
        if (await this.find(email)) return { success: false, message: 'User already exists' };

        const identity = { email, password, isPremium: false, tierLevel: 'free' };
        if (this.persistent && this.User) {
            try {
                await this.User.create(identity);
            } catch (e) {
                return { success: false, message: 'Could not create account' };
            }
        } else {
            this.memory.set(email, identity);
        }
        return { success: true, identity };
    }

    async login(email, password) {
        if (!email || !password) return { success: false, message: 'Email and password required' };
        const identity = await this.find(email);
        if (!identity || identity.password !== password) {
            return { success: false, message: 'Invalid credentials' };
        }
        return { success: true, identity };
    }

    async setPremium(email, tier = 'pro') {
        if (!email) return false;
        await this.ready();
        const level = String(tier || 'pro').toLowerCase();
        if (this.persistent && this.User) {
            try {
                await this.User.updateOne({ email }, { isPremium: true, tierLevel: level });
                return true;
            } catch (e) {
                return false;
            }
        }
        const identity = this.memory.get(email);
        if (!identity) return false;
        identity.isPremium = true;
        identity.tierLevel = level;
        return true;
    }

    destroy() {
        if (this.persistent) {
            try { require('mongoose').disconnect(); } catch (e) { /* best effort */ }
        }
    }
}

module.exports = AccountService;
module.exports.DEMO_EMAIL = DEMO_EMAIL;
module.exports.DEMO_PASSWORD = DEMO_PASSWORD;
