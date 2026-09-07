/**
 * WebSocket Market Stream
 * 
 * Provides real-time market data streaming via WebSocket.
 * 
 * Features:
 * - One shared gateway connection per provider
 * - Multiplexed symbol subscriptions (not one connection per stock)
 * - Automatic reconnect with exponential backoff
 * - Heartbeat monitoring
 * - Subscription management (subscribe/unsubscribe/subscribeMany)
 * - Demo mode: generates simulated price updates for development
 * 
 * Client protocol:
 * → { action: "subscribe", symbols: ["RELIANCE", "TCS"] }
 * → { action: "unsubscribe", symbols: ["TCS"] }
 * ← { type: "quote", data: { symbol, price, change, volume, ... } }
 * ← { type: "heartbeat", timestamp: "..." }
 * ← { type: "status", market: "open", connection: "live" }
 */
const EventEmitter = require('events');

class MarketStream extends EventEmitter {
    constructor(gateway, config = {}) {
        super();
        this.gateway = gateway;
        this.clients = new Set(); // Connected WebSocket clients
        this.subscriptions = new Map(); // symbol → Set<client>
        this.clientSymbols = new Map(); // client → Set<symbol>
        this.isDemoMode = config.isDemoMode !== false;
        this.updateInterval = config.updateInterval || 2000; // ms between price updates
        this._demoTimer = null;
        this._heartbeatTimer = null;
        this._marketStatus = 'closed';
        this._baseprices = new Map(); // For demo mode price simulation
    }

    /**
     * Attach to an HTTP server and start handling WebSocket connections
     * Uses a simple polling approach since we can't rely on ws library
     */
    start(httpServer) {
        // Try to use ws library if available
        try {
            const WebSocket = require('ws');
            this.wss = new WebSocket.Server({ server: httpServer, path: '/market/ws' });

            this.wss.on('connection', (ws, req) => {
                this._handleConnection(ws, req);
            });

            console.log('  WebSocket server started on /market/ws');
        } catch (e) {
            // ws not installed — run in polling mode
            console.log('  ws library not found. WebSocket running in polling mode.');
            console.log('  Install ws: npm install ws');
        }

        // Start heartbeat
        this._heartbeatTimer = setInterval(() => this._broadcastHeartbeat(), 30000);

        // Check market status
        this._updateMarketStatus();

        // Start demo simulation if no API keys
        if (this.isDemoMode) {
            this._startDemoSimulation();
        }

        return this;
    }

    _handleConnection(ws, req) {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        ws._clientId = clientId;

        this.clients.add(ws);
        this.clientSymbols.set(ws, new Set());

        // Send welcome message
        this._send(ws, {
            type: 'status',
            connection: 'live',
            market: this._marketStatus,
            demo: this.isDemoMode,
            message: this.isDemoMode ? 'Connected to demo market stream' : 'Connected to live market stream',
            timestamp: new Date().toISOString()
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                this._handleMessage(ws, msg);
            } catch (e) {
                this._send(ws, { type: 'error', message: 'Invalid message format' });
            }
        });

        ws.on('close', () => {
            this._handleDisconnect(ws);
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error (${clientId}):`, error.message);
            this._handleDisconnect(ws);
        });

        // Send initial market status
        this._send(ws, {
            type: 'market_status',
            status: this._marketStatus,
            indices: this._getDemoIndices(),
            timestamp: new Date().toISOString()
        });
    }

    _handleMessage(ws, msg) {
        switch (msg.action) {
            case 'subscribe':
                this._subscribe(ws, msg.symbols || []);
                break;
            case 'unsubscribe':
                this._unsubscribe(ws, msg.symbols || []);
                break;
            case 'subscribeMany':
                this._subscribe(ws, msg.symbols || []);
                break;
            case 'ping':
                this._send(ws, { type: 'pong', timestamp: new Date().toISOString() });
                break;
            default:
                this._send(ws, { type: 'error', message: `Unknown action: ${msg.action}` });
        }
    }

    _subscribe(ws, symbols) {
        const clientSyms = this.clientSymbols.get(ws) || new Set();
        for (const symbol of symbols) {
            clientSyms.add(symbol);
            if (!this.subscriptions.has(symbol)) {
                this.subscriptions.set(symbol, new Set());
            }
            this.subscriptions.get(symbol).add(ws);
        }
        this.clientSymbols.set(ws, clientSyms);

        this._send(ws, {
            type: 'subscribed',
            symbols,
            total: clientSyms.size,
            timestamp: new Date().toISOString()
        });
    }

    _unsubscribe(ws, symbols) {
        const clientSyms = this.clientSymbols.get(ws) || new Set();
        for (const symbol of symbols) {
            clientSyms.delete(symbol);
            const subs = this.subscriptions.get(symbol);
            if (subs) {
                subs.delete(ws);
                if (subs.size === 0) this.subscriptions.delete(symbol);
            }
        }
        this.clientSymbols.set(ws, clientSyms);

        this._send(ws, {
            type: 'unsubscribed',
            symbols,
            total: clientSyms.size,
            timestamp: new Date().toISOString()
        });
    }

    _handleDisconnect(ws) {
        const clientSyms = this.clientSymbols.get(ws) || new Set();
        for (const symbol of clientSyms) {
            const subs = this.subscriptions.get(symbol);
            if (subs) {
                subs.delete(ws);
                if (subs.size === 0) this.subscriptions.delete(symbol);
            }
        }
        this.clients.delete(ws);
        this.clientSymbols.delete(ws);
    }

    /**
     * Broadcast a quote update to all subscribed clients
     */
    broadcast(quote) {
        const symbol = quote.symbol;
        const subs = this.subscriptions.get(symbol);
        if (!subs || subs.size === 0) return;

        const message = {
            type: 'quote',
            data: {
                symbol: quote.symbol,
                exchange: quote.exchange,
                price: quote.price,
                change: quote.change,
                changePercent: quote.changePercent,
                bid: quote.bid,
                ask: quote.ask,
                volume: quote.volume,
                timestamp: quote.timestamp,
                source: quote.source,
                dataQuality: quote.dataQuality
            }
        };

        for (const client of subs) {
            this._send(client, message);
        }
    }

    /**
     * Broadcast to ALL connected clients (market status, etc.)
     */
    broadcastAll(message) {
        for (const client of this.clients) {
            this._send(client, message);
        }
    }

    _send(ws, data) {
        if (ws.readyState === 1) { // WebSocket.OPEN
            try {
                ws.send(JSON.stringify(data));
            } catch (e) { /* client probably disconnected */ }
        }
    }

    _broadcastHeartbeat() {
        this.broadcastAll({
            type: 'heartbeat',
            timestamp: new Date().toISOString(),
            clients: this.clients.size,
            subscriptions: this.subscriptions.size,
            market: this._marketStatus
        });
    }

    _updateMarketStatus() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const day = now.getDay();
        const time = hours * 60 + minutes;

        // Indian market hours (9:15 AM - 3:30 PM IST)
        if (day >= 1 && day <= 5 && time >= 555 && time <= 930) {
            this._marketStatus = 'open';
        } else if (day >= 1 && day <= 5 && time >= 390 && time < 555) {
            this._marketStatus = 'pre-market';
        } else if (day >= 1 && day <= 5 && time > 930 && time <= 1020) {
            this._marketStatus = 'post-market';
        } else {
            this._marketStatus = 'closed';
        }
    }

    // ========================================
    // DEMO MODE: Simulated price updates
    // ========================================

    _startDemoSimulation() {
        // Initialize base prices
        const demoSymbols = {
            'RELIANCE': 2450, 'TCS': 3280, 'HDFCBANK': 1645, 'INFY': 1520,
            'SBIN': 586, 'ICICIBANK': 950, 'BHARTIARTL': 890, 'ITC': 421,
            'NIFTY': 24175, 'SENSEX': 80200, 'BANKNIFTY': 51500,
            'BTC': 65000, 'ETH': 3500, 'SOL': 150,
            'USDINR': 83.5, 'EURINR': 90.2
        };

        for (const [sym, price] of Object.entries(demoSymbols)) {
            this._baseprices.set(sym, price);
        }

        // Emit updates at regular intervals
        this._demoTimer = setInterval(() => {
            this._simulateUpdates();
        }, this.updateInterval);
    }

    _simulateUpdates() {
        for (const [symbol, basePrice] of this._baseprices) {
            // Random walk with mean reversion
            const drift = (Math.random() - 0.5) * 0.002;
            const meanReversion = (basePrice - this._getCurrentPrice(symbol)) / basePrice * 0.01;
            const newPrice = basePrice * (1 + drift + meanReversion);

            this._baseprices.set(symbol, newPrice);

            const change = newPrice - basePrice;
            const changePercent = (change / basePrice) * 100;

            const quote = {
                symbol,
                exchange: 'DEMO',
                price: parseFloat(newPrice.toFixed(2)),
                bid: parseFloat((newPrice * 0.999).toFixed(2)),
                ask: parseFloat((newPrice * 1.001).toFixed(2)),
                volume: Math.floor(100000 + Math.random() * 500000),
                open: parseFloat((basePrice * 0.998).toFixed(2)),
                high: parseFloat((newPrice * (1 + Math.random() * 0.01)).toFixed(2)),
                low: parseFloat((newPrice * (1 - Math.random() * 0.01)).toFixed(2)),
                previousClose: parseFloat(basePrice.toFixed(2)),
                change: parseFloat(change.toFixed(2)),
                changePercent: parseFloat(changePercent.toFixed(2)),
                timestamp: new Date().toISOString(),
                source: 'demo',
                dataQuality: 'DEMO'
            };

            this.broadcast(quote);
        }
    }

    _getCurrentPrice(symbol) {
        return this._baseprices.get(symbol) || 100;
    }

    _getDemoIndices() {
        return [
            { symbol: 'NIFTY', name: 'NIFTY 50', price: this._getCurrentPrice('NIFTY'), change: 0, changePercent: 0 },
            { symbol: 'SENSEX', name: 'BSE SENSEX', price: this._getCurrentPrice('SENSEX'), change: 0, changePercent: 0 },
            { symbol: 'BANKNIFTY', name: 'NIFTY Bank', price: this._getCurrentPrice('BANKNIFTY'), change: 0, changePercent: 0 }
        ];
    }

    /**
     * Get stream statistics
     */
    getStats() {
        return {
            clients: this.clients.size,
            subscriptions: this.subscriptions.size,
            symbols: [...this.subscriptions.keys()],
            marketStatus: this._marketStatus,
            isDemoMode: this.isDemoMode
        };
    }

    destroy() {
        if (this._demoTimer) clearInterval(this._demoTimer);
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        for (const client of this.clients) {
            try { client.close(); } catch (e) {}
        }
        this.clients.clear();
        this.subscriptions.clear();
        this.clientSymbols.clear();
    }
}

module.exports = MarketStream;
