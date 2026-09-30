// tests/api.test.js - End-to-End API Route Tests
const request = require('supertest');
const { app } = require('../../server');

describe('ProTrader REST API Endpoints', () => {
    test('GET /health: returns server status UP', async () => {
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('UP');
    });

    test('GET /api/market-data: returns multi-asset categories', async () => {
        const res = await request(app).get('/api/market-data');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('stocks');
        expect(res.body).toHaveProperty('crypto');
        expect(res.body).toHaveProperty('forex');
        expect(res.body).toHaveProperty('commodities');
    });

    test('GET /api/candles: returns historical OHLCV bars', async () => {
        const res = await request(app).get('/api/candles?symbol=RELIANCE&count=30&interval=5m');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.candles.length).toBe(30);
        expect(res.body.candles[0]).toHaveProperty('close');
    });

    test('GET /api/indicators: calculates quantitative indicators', async () => {
        const res = await request(app).get('/api/indicators?symbol=RELIANCE');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.indicators).toHaveProperty('rsi');
        expect(res.body.indicators).toHaveProperty('macd');
        expect(res.body.indicators).toHaveProperty('bollingerBands');
    });

    test('POST /api/monte-carlo: runs strategy distribution simulation', async () => {
        const res = await request(app)
            .post('/api/monte-carlo')
            .send({
                initialCapital: 100000,
                numTrades: 50,
                numSimulations: 500,
                winRate: 0.55
            });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.summary).toBeDefined();
        expect(res.body.summary.medianFinalEquity).toBeGreaterThan(0);
    });

    test('POST /api/chat: responds to quantitative trading questions', async () => {
        const res = await request(app)
            .post('/api/chat')
            .send({ message: 'Should I buy RELIANCE?' });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.reply).toContain('RELIANCE');
    });

    test('POST /api/trade: executes market order in session', async () => {
        const email = 'demo@college.com';
        const symbol = 'RELIANCE';

        // 1. Get Risk Gate Token
        const gateRes = await request(app)
            .post('/api/analyze-thesis')
            .send({
                email,
                symbol,
                thesis: 'Strong bullish trend with RSI divergence and positive news sentiment.',
                direction: 'BUY',
                quantity: 1
            });
        
        expect(gateRes.statusCode).toBe(200);
        const token = gateRes.body.riskGateToken;
        expect(token).toBeDefined();

        // 2. Execute Trade using Token
        const res = await request(app)
            .post('/api/trade')
            .send({
                email,
                symbol,
                type: 'BUY',
                quantity: 1,
                assetType: 'stocks',
                riskGateToken: token
            });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.trade).toHaveProperty('id');
        expect(res.body.newBalance).toBeLessThan(100000);
    });
});
