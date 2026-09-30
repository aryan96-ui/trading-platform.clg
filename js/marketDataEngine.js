// marketDataEngine.js - Real-Time WebSocket Market Data Engine
class MarketDataEngine {
    constructor() {
        this.connections = new Map();
        this.subscribers = new Map(); // symbol -> Set of callbacks
        this.priceCache = new Map(); // symbol -> { price, change }
        this.throttledUpdates = new Map(); // symbol -> throttling object
        this.statusCallbacks = new Set(); // functions to notify about status changes
        this.fallbackInterval = null;
        this.orderBookWs = null;
    }

    // Register callback for connection status updates
    onStatusChange(callback) {
        this.statusCallbacks.add(callback);
    }

    notifyStatus(status) {
        this.statusCallbacks.forEach(cb => cb(status));
    }

    async initializeConnections() {
        console.log('MarketDataEngine: Initializing Exchange Connections...');
        this.notifyStatus('connecting');

        const exchanges = {
            binance: {
                url: 'wss://stream.binance.com:9443/ws/!ticker@arr',
                ws: null,
                setup: (ws) => {
                    ws.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            if (Array.isArray(data)) {
                                data.forEach(ticker => {
                                    // Match crypto symbols (e.g. BTCUSDT -> BTC)
                                    if (ticker.s.endsWith('USDT')) {
                                        const symbol = ticker.s.replace('USDT', '');
                                        const price = parseFloat(ticker.c);
                                        const change = parseFloat(ticker.P);
                                        this.updatePriceCache(symbol, price, change);
                                    }
                                });
                            }
                        } catch (err) {
                            console.error('Binance feed error:', err);
                        }
                    };
                }
            },
            coinbase: {
                url: 'wss://ws-feed.pro.coinbase.com',
                ws: null,
                setup: (ws) => {
                    ws.onopen = () => {
                        ws.send(JSON.stringify({
                            type: 'subscribe',
                            channels: [{ name: 'ticker', product_ids: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'ADA-USD', 'XRP-USD'] }]
                        }));
                    };
                    ws.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            if (data.type === 'ticker' && data.product_id) {
                                const symbol = data.product_id.split('-')[0];
                                const price = parseFloat(data.price);
                                const open = parseFloat(data.open_24h || data.price);
                                const change = open !== 0 ? ((price - open) / open) * 100 : 0;
                                this.updatePriceCache(symbol, price, change);
                            }
                        } catch (err) {
                            console.error('Coinbase feed error:', err);
                        }
                    };
                }
            },
            kraken: {
                url: 'wss://ws.kraken.com',
                ws: null,
                setup: (ws) => {
                    ws.onopen = () => {
                        ws.send(JSON.stringify({
                            event: 'subscribe',
                            pair: ['XBT/USD', 'ETH/USD', 'SOL/USD', 'ADA/USD', 'XRP/USD'],
                            subscription: { name: 'ticker' }
                        }));
                    };
                    ws.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            // Kraken ticker messages look like: [channelID, {a: [...], b: [...], c: [price, volume], ...}, "ticker", "XBT/USD"]
                            if (Array.isArray(data) && data[2] === 'ticker') {
                                let symbol = data[3].split('/')[0];
                                if (symbol === 'XBT') symbol = 'BTC';
                                const price = parseFloat(data[1].c[0]);
                                const todayOpen = parseFloat(data[1].o[0]);
                                const change = todayOpen !== 0 ? ((price - todayOpen) / todayOpen) * 100 : 0;
                                this.updatePriceCache(symbol, price, change);
                            }
                        } catch (err) {
                            console.error('Kraken feed error:', err);
                        }
                    };
                }
            }
        };

        // Initialize exchange websockets
        Object.entries(exchanges).forEach(([name, config]) => {
            this.connectExchange(name, config);
        });

        // Setup fallback polling for other asset types or redundant sources
        this.setupCoinGeckoFallback();

        // Monitor connections
        this.monitorConnections(exchanges);

        return exchanges;
    }

    connectExchange(name, config) {
        try {
            console.log(`Connecting to ${name}...`);
            const ws = new WebSocket(config.url);
            config.ws = ws;
            this.connections.set(name, ws);

            config.setup(ws);

            ws.onopen = (e) => {
                console.log(`WebSocket connected to ${name}`);
                this.updateHealthIndicator();
            };

            ws.onclose = () => {
                console.warn(`WebSocket to ${name} closed. Reconnecting in 5s...`);
                this.connections.delete(name);
                this.updateHealthIndicator();
                setTimeout(() => this.connectExchange(name, config), 5000);
            };

            ws.onerror = (err) => {
                console.error(`WebSocket to ${name} error:`, err);
                ws.close();
            };
        } catch (e) {
            console.error(`Failed to connect to ${name}:`, e);
        }
    }

    monitorConnections(exchanges) {
        setInterval(() => {
            this.updateHealthIndicator();
        }, 10000);
    }

    updateHealthIndicator() {
        let connectedCount = 0;
        this.connections.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                connectedCount++;
            }
        });

        if (connectedCount === this.connections.size && this.connections.size > 0) {
            this.notifyStatus('online');
        } else if (connectedCount > 0) {
            this.notifyStatus('partial');
        } else {
            this.notifyStatus('offline');
        }
    }

    setupCoinGeckoFallback() {
        const pollPrices = async () => {
            try {
                // Fetch latest data from the backend aggregator endpoint
                const response = await fetch('/api/market-data');
                if (!response.ok) throw new Error('API fetch failed');
                const data = await response.json();

                // Update all items in the cache (stocks, crypto, forex, commodities)
                Object.entries(data).forEach(([type, assets]) => {
                    Object.entries(assets).forEach(([symbol, value]) => {
                        this.updatePriceCache(symbol, value.price, value.change);
                    });
                });
            } catch (err) {
                console.warn('Fallback market data polling error:', err);
            }
        };

        // Poll immediately and then every 5 seconds
        pollPrices();
        this.fallbackInterval = setInterval(pollPrices, 5000);
    }

    // Update prices in cache and notify subscribers (with optional throttling)
    updatePriceCache(symbol, price, change) {
        this.priceCache.set(symbol, { price, change });

        // Trigger subscribers
        if (this.subscribers.has(symbol)) {
            const data = { price, change };
            this.subscribers.get(symbol).forEach(throttledCallback => {
                throttledCallback(data);
            });
        }
    }

    // Subscribe to symbol changes
    subscribe(symbol, callback) {
        if (!this.subscribers.has(symbol)) {
            this.subscribers.set(symbol, new Set());
        }

        // Apply throttling to the callback
        const throttledCallback = this.setupSmartThrottling(symbol, callback);
        this.subscribers.get(symbol).add(throttledCallback);

        // Instantly supply cached value if available
        if (this.priceCache.has(symbol)) {
            callback(this.priceCache.get(symbol));
        }

        // Return unsubscribe function
        return () => {
            const subs = this.subscribers.get(symbol);
            if (subs) {
                subs.delete(throttledCallback);
                if (subs.size === 0) {
                    this.subscribers.delete(symbol);
                }
            }
        };
    }

    setupSmartThrottling(symbol, callback) {
        // Only update UI at 60fps max to prevent jank
        const fps = 60;
        const interval = 1000 / fps;
        
        if (!this.throttledUpdates.has(symbol)) {
            this.throttledUpdates.set(symbol, {
                lastUpdate: 0,
                pendingUpdate: null,
                callback: callback
            });
        }

        const throttled = this.throttledUpdates.get(symbol);

        return (data) => {
            const now = Date.now();
            
            if (now - throttled.lastUpdate > interval) {
                throttled.callback(data);
                throttled.lastUpdate = now;
            } else {
                // Queue the update
                throttled.pendingUpdate = data;
                setTimeout(() => {
                    if (throttled.pendingUpdate) {
                        throttled.callback(throttled.pendingUpdate);
                        throttled.lastUpdate = Date.now();
                        throttled.pendingUpdate = null;
                    }
                }, interval - (now - throttled.lastUpdate));
            }
        };
    }

    async setupOrderBookDepth(symbol) {
        // Close existing depth connection if open
        if (this.orderBookWs) {
            this.orderBookWs.close();
            this.orderBookWs = null;
        }

        // Real order book structure
        const orderBook = {
            bids: [],
            asks: [],
            spread: 0
        };

        // Format symbol for Binance (e.g., BTC -> btcusdt)
        const formatSymbolMap = {
            'BTC': 'btcusdt',
            'ETH': 'ethusdt',
            'SOL': 'solusdt',
            'ADA': 'adausdt',
            'XRP': 'xrpusdt'
        };
        const binanceSymbol = formatSymbolMap[symbol] || `${symbol.toLowerCase()}usdt`;

        console.log(`Subscribing to Binance Order Book for: ${binanceSymbol}`);
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol}@depth20@100ms`);
        this.orderBookWs = ws;

        const throttledRender = this.setupSmartThrottling(symbol + '-depth', (ob) => {
            this.renderOrderBookDepth(ob);
        });
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.updateOrderBook(orderBook, data);
                throttledRender(orderBook);
            } catch (e) {
                console.error('Order book parsing error:', e);
            }
        };

        ws.onerror = (e) => {
            console.error('Order Book WS error:', e);
        };

        return orderBook;
    }

    updateOrderBook(orderBook, data) {
        if (!data.bids || !data.asks) return;
        
        // Take top 10 price levels
        orderBook.bids = data.bids.slice(0, 10).map(b => ({
            price: parseFloat(b[0]),
            size: parseFloat(b[1])
        }));
        
        orderBook.asks = data.asks.slice(0, 10).map(a => ({
            price: parseFloat(a[0]),
            size: parseFloat(a[1])
        }));

        if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
            orderBook.spread = orderBook.asks[0].price - orderBook.bids[0].price;
        }
    }

    renderOrderBookDepth(orderBook) {
        const bidsEl = document.getElementById('order-book-bids');
        const asksEl = document.getElementById('order-book-asks');
        const spreadEl = document.getElementById('order-book-spread');
        
        if (bidsEl && orderBook.bids.length > 0) {
            const maxBidsVolume = Math.max(...orderBook.bids.map(b => b.size)) || 1;
            bidsEl.innerHTML = orderBook.bids.map(b => {
                const pct = Math.min(100, (b.size / maxBidsVolume) * 100);
                return `
                    <div class="order-book-row" style="position: relative; display: flex; justify-content: space-between; padding: 4px 8px; font-family: monospace;">
                        <div class="depth-bg" style="position: absolute; right: 0; top: 0; bottom: 0; width: ${pct}%; background: rgba(38, 166, 154, 0.15); z-index: 1; transition: width 0.1s ease;"></div>
                        <span class="price" style="color: var(--accent-green); z-index: 2; font-weight: 600;">${b.price.toFixed(2)}</span>
                        <span class="size" style="color: var(--text-primary); z-index: 2;">${b.size.toFixed(4)}</span>
                    </div>
                `;
            }).join('');
        }
        
        if (asksEl && orderBook.asks.length > 0) {
            const maxAsksVolume = Math.max(...orderBook.asks.map(a => a.size)) || 1;
            asksEl.innerHTML = orderBook.asks.map(a => {
                const pct = Math.min(100, (a.size / maxAsksVolume) * 100);
                return `
                    <div class="order-book-row" style="position: relative; display: flex; justify-content: space-between; padding: 4px 8px; font-family: monospace;">
                        <div class="depth-bg" style="position: absolute; left: 0; top: 0; bottom: 0; width: ${pct}%; background: rgba(239, 83, 80, 0.15); z-index: 1; transition: width 0.1s ease;"></div>
                        <span class="price" style="color: var(--accent-red); z-index: 2; font-weight: 600;">${a.price.toFixed(2)}</span>
                        <span class="size" style="color: var(--text-primary); z-index: 2;">${a.size.toFixed(4)}</span>
                    </div>
                `;
            }).join('');
        }
        
        if (spreadEl && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
            const spreadPercent = (orderBook.spread / orderBook.asks[0].price) * 100;
            spreadEl.innerHTML = `
                <div style="font-weight: 600; color: var(--text-secondary); display: flex; justify-content: space-between; padding: 6px 8px; background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px dashed var(--border-color);">
                    <span>Spread</span>
                    <span style="color: var(--text-primary);">${orderBook.spread.toFixed(2)} (${spreadPercent.toFixed(4)}%)</span>
                </div>
            `;
        }
    }
}
