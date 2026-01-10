// test-server.js - Simple test to verify Node.js and Express are working
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Server is working!' });
});

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API is working!',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`TEST SERVER RUNNING ON http://localhost:${PORT}`);
    console.log('='.repeat(50));
});
