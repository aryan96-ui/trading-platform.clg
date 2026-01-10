// Quick MongoDB connection test
require('dotenv').config();
const mongoose = require('mongoose');

console.log('========================================');
console.log('MongoDB Connection Test');
console.log('========================================');
console.log('');
console.log('Testing connection to MongoDB Atlas...');
console.log('URI:', process.env.MONGODB_URI ? 'Found in .env' : 'NOT FOUND');
console.log('');

mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4
})
    .then(() => {
        console.log('✅ SUCCESS! MongoDB connection established');
        console.log('✅ Database is accessible');
        console.log('');
        console.log('Your MongoDB is working perfectly!');
        process.exit(0);
    })
    .catch(err => {
        console.log('❌ FAILED! Could not connect to MongoDB');
        console.log('');
        console.log('Error Details:');
        console.log('  Type:', err.name);
        console.log('  Message:', err.message);
        console.log('');
        console.log('Common Solutions:');
        console.log('  1. Check internet connection');
        console.log('  2. Whitelist IP in MongoDB Atlas (Network Access)');
        console.log('  3. Verify credentials in .env file');
        console.log('  4. Ensure cluster is not paused');
        console.log('');
        console.log('The server will run in IN-MEMORY mode instead.');
        process.exit(1);
    });

// Timeout after 10 seconds
setTimeout(() => {
    console.log('⏱️  Connection timeout - taking too long');
    process.exit(1);
}, 10000);
