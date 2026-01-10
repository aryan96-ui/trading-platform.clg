const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    plan: { type: String, default: 'FREE' },
    // optional fields for future use
    isPremium: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', UserSchema);
