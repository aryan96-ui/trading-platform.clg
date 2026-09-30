// models/Trade.js - Ledger of Executed Trades
const mongoose = require('mongoose');

const TradeSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    symbol: { type: String, required: true, uppercase: true },
    type: { type: String, enum: ['BUY', 'SELL', 'buy', 'sell'], required: true },
    assetType: { type: String, enum: ['stocks', 'crypto', 'forex', 'commodities'], default: 'stocks' },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    orderType: { type: String, enum: ['MARKET', 'LIMIT', 'STOP_LOSS'], default: 'MARKET' },
    pnl: { type: Number, default: 0 },
    pnlPercent: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Trade || mongoose.model('Trade', TradeSchema);
