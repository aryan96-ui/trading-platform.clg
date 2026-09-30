// services/webSocketService.js - Zero-Latency WebSocket / Socket.IO Hub
const { Server } = require('socket.io');
const marketDataService = require('./marketDataService');

class WebSocketService {
    constructor() {
        this.io = null;
        this.subscribers = new Map(); // symbol -> Set of socket IDs
        this.intervalId = null;
    }

    init(httpServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });

        this.io.on('connection', (socket) => {
            // Send initial connection welcome & current market snapshot
            socket.emit('connection_established', {
                status: 'connected',
                timestamp: Date.now(),
                message: 'ProTrader Zero-Latency Market Stream Active'
            });

            // Handle symbol subscription
            socket.on('subscribe', (symbol) => {
                if (!symbol) return;
                const sym = symbol.toUpperCase();
                socket.join(`symbol:${sym}`);
                
                // Immediately send latest snapshot for requested symbol
                const state = marketDataService.currentPrices.get(sym);
                if (state) {
                    socket.emit('tick', state);
                }
            });

            // Handle symbol unsubscription
            socket.on('unsubscribe', (symbol) => {
                if (!symbol) return;
                socket.leave(`symbol:${symbol.toUpperCase()}`);
            });

            // Handle client ping for latency measurement
            socket.on('ping_check', (data, ack) => {
                if (typeof ack === 'function') ack({ timestamp: Date.now() });
            });

            socket.on('disconnect', () => {
                // Socket automatically leaves rooms
            });
        });

        // Start high-frequency tick generator (100ms - 500ms jitter)
        this.startStreaming();
        console.log('✅ WebSocket / Socket.IO Server initialized for real-time market feeds');
    }

    startStreaming() {
        if (this.intervalId) clearInterval(this.intervalId);

        const symbols = Array.from(marketDataService.currentPrices.keys());

        // Emit high-frequency ticks
        this.intervalId = setInterval(() => {
            if (!this.io) return;

            // Pick 1-3 random active symbols per tick interval for realistic multi-asset updates
            const numUpdates = Math.floor(Math.random() * 3) + 1;
            for (let i = 0; i < numUpdates; i++) {
                const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                const updatedTick = marketDataService.simulateTick(randomSymbol);

                if (updatedTick) {
                    // Broadcast to specific symbol room
                    this.io.to(`symbol:${randomSymbol}`).emit('tick', updatedTick);
                    // Broadcast general price update
                    this.io.emit('price_update', {
                        symbol: updatedTick.symbol,
                        price: updatedTick.price,
                        change: updatedTick.change,
                        changePercent: updatedTick.changePercent,
                        volume: updatedTick.volume,
                        timestamp: updatedTick.timestamp
                    });
                }
            }
        }, 350); // Every 350ms
        if (this.intervalId.unref) this.intervalId.unref();
    }

    // Broadcast market news
    broadcastNews(newsItem) {
        if (this.io) {
            this.io.emit('news_flash', newsItem);
        }
    }

    // Broadcast trade notifications
    broadcastTrade(trade) {
        if (this.io) {
            this.io.emit('trade_executed', trade);
        }
    }
}

module.exports = new WebSocketService();
