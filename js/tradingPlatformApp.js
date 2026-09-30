/**
 * ProTrader - Interactive Real-World Trading Web Platform Engine
 * Powered by canvas candlestick charting, live order book, technical indicators, portfolio tracker & user session manager
 */

// Initial Markets Data
const INITIAL_MARKETS = [
    {
        symbol: 'RELIANCE',
        name: 'Reliance Industries Ltd. • NSE',
        category: 'Stocks',
        price: 2430.20,
        change: 32.80,
        changePct: 1.37,
        high: 2450.00,
        low: 2420.00,
        open: 2425.00,
        prevClose: 2397.40,
        volume: '8.4M',
        status: 'Market open',
        perf: { w1: '+2.69%', m1: '+0.98%', m3: '+1.84%', m6: '-4.43%', ytd: '-5.95%', y1: '+0.08%' },
        sentiment: 72
    },
    {
        symbol: 'TCS',
        name: 'Tata Consultancy Services • NSE',
        category: 'Stocks',
        price: 3264.87,
        change: 31.90,
        changePct: 0.99,
        high: 3280.00,
        low: 3240.00,
        open: 3250.00,
        prevClose: 3232.97,
        volume: '3.2M',
        status: 'Market open',
        perf: { w1: '+1.80%', m1: '+3.20%', m3: '+5.40%', m6: '+8.10%', ytd: '+11.50%', y1: '+19.20%' },
        sentiment: 68
    },
    {
        symbol: 'HDFCBANK',
        name: 'HDFC Bank Ltd. • NSE',
        category: 'Stocks',
        price: 1626.60,
        change: -21.90,
        changePct: -1.33,
        high: 1650.00,
        low: 1620.00,
        open: 1648.00,
        prevClose: 1648.50,
        volume: '6.8M',
        status: 'Market open',
        perf: { w1: '-0.90%', m1: '+1.40%', m3: '+2.80%', m6: '+6.10%', ytd: '+8.40%', y1: '+14.80%' },
        sentiment: 42
    },
    {
        symbol: 'INFY',
        name: 'Infosys Ltd. • NSE',
        category: 'Stocks',
        price: 1503.31,
        change: 48.20,
        changePct: 3.31,
        high: 1515.00,
        low: 1475.00,
        open: 1480.00,
        prevClose: 1455.11,
        volume: '5.1M',
        status: 'Market open',
        perf: { w1: '+4.50%', m1: '+6.20%', m3: '+9.80%', m6: '+14.20%', ytd: '+18.50%', y1: '+26.10%' },
        sentiment: 85
    },
    {
        symbol: 'SBIN',
        name: 'State Bank of India • NSE',
        category: 'Stocks',
        price: 582.65,
        change: -9.60,
        changePct: -1.62,
        high: 595.00,
        low: 580.00,
        open: 592.00,
        prevClose: 592.25,
        volume: '9.4M',
        status: 'Market open',
        perf: { w1: '-2.10%', m1: '-0.50%', m3: '+3.40%', m6: '+7.80%', ytd: '+10.20%', y1: '+18.40%' },
        sentiment: 38
    },
    {
        symbol: 'ICICIBANK',
        name: 'ICICI Bank Ltd. • NSE',
        category: 'Stocks',
        price: 937.68,
        change: 1.95,
        changePct: 0.21,
        high: 945.00,
        low: 932.00,
        open: 935.00,
        prevClose: 935.73,
        volume: '4.5M',
        status: 'Market open',
        perf: { w1: '+1.20%', m1: '+2.80%', m3: '+6.40%', m6: '+12.10%', ytd: '+15.80%', y1: '+22.50%' },
        sentiment: 58
    },
    {
        symbol: 'NIFTY 50',
        name: 'Nifty 50 Index • NSE',
        category: 'Indices',
        price: 24614.90,
        change: -159.40,
        changePct: -0.64,
        high: 24650.00,
        low: 24400.00,
        open: 24614.90,
        prevClose: 24774.30,
        volume: '1.45M',
        status: 'Market open',
        perf: { w1: '+2.69%', m1: '+0.98%', m3: '+1.84%', m6: '-4.43%', ytd: '-5.95%', y1: '+0.08%' },
        sentiment: 48
    },
    {
        symbol: 'BTC/USD',
        name: 'Bitcoin / US Dollar',
        category: 'Crypto',
        price: 64820.50,
        change: 1350.20,
        changePct: 2.13,
        high: 65400.00,
        low: 63100.00,
        open: 63470.30,
        prevClose: 63470.30,
        volume: '14.2B',
        status: '24/7 Live',
        perf: { w1: '+8.40%', m1: '+14.20%', m3: '+22.50%', m6: '+45.10%', ytd: '+68.20%', y1: '+112.40%' },
        sentiment: 88
    },
    {
        symbol: 'ETH/USD',
        name: 'Ethereum / US Dollar',
        category: 'Crypto',
        price: 3450.80,
        change: 125.40,
        changePct: 3.77,
        high: 3500.00,
        low: 3320.00,
        open: 3325.40,
        prevClose: 3325.40,
        volume: '6.8B',
        status: '24/7 Live',
        perf: { w1: '+6.20%', m1: '+10.50%', m3: '+18.40%', m6: '+38.20%', ytd: '+52.10%', y1: '+94.20%' },
        sentiment: 80
    },
    {
        symbol: 'USD/INR',
        name: 'US Dollar / Indian Rupee',
        category: 'Forex',
        price: 83.30,
        change: 0.11,
        changePct: 0.13,
        high: 83.45,
        low: 83.20,
        open: 83.22,
        prevClose: 83.19,
        volume: '2.4B',
        status: 'Forex Live',
        perf: { w1: '+0.10%', m1: '+0.40%', m3: '+0.80%', m6: '+1.20%', ytd: '+1.80%', y1: '+2.40%' },
        sentiment: 50
    },
    {
        symbol: 'GOLD',
        name: 'Gold spot (₹/10g)',
        category: 'Commodities',
        price: 72450.00,
        change: 450.00,
        changePct: 0.62,
        high: 72600.00,
        low: 71900.00,
        open: 72000.00,
        prevClose: 72000.00,
        volume: '1.2M',
        status: 'Market open',
        perf: { w1: '+1.80%', m1: '+3.40%', m3: '+7.20%', m6: '+15.40%', ytd: '+18.90%', y1: '+24.50%' },
        sentiment: 76
    }
];

class RealTradingPlatform {
    constructor() {
        this.markets = [...INITIAL_MARKETS];
        this.activeSymbol = 'RELIANCE';
        this.activeTimeframe = '5m';
        this.activeChartType = 'candles';
        this.indicators = {
            volume: true,
            rsi: true,
            macd: false,
            ema20: true
        };
        
        // Load User Session & Balance
        const savedEmail = localStorage.getItem('userEmail') || 'demo@college.com';
        const savedBalance = parseFloat(localStorage.getItem('userBalance')) || 100000.00;
        
        this.userEmail = savedEmail;
        this.userBalance = savedBalance;
        this.positions = JSON.parse(localStorage.getItem('userPositions')) || [];
        this.activeTool = 'crosshair';
        this.chartData = [];
        this.crosshairPos = { x: -1, y: -1 };
        
        this.init();
    }

    init() {
        this.updateUserSessionUI();
        this.generateHistoricalData(this.activeSymbol);
        this.setupDOMEventListeners();
        this.renderWatchlist();
        this.renderMarquee();
        this.renderSymbolDetails();
        this.renderOrderBook();
        this.renderPortfolioUI();
        this.initCanvasChart();
        this.startPriceSimulation();
    }

    // Sync logged in user details across top bar
    updateUserSessionUI() {
        const emailEl = document.getElementById('user-email');
        const navBalEl = document.getElementById('nav-balance');
        const dockBalEl = document.getElementById('dock-balance');
        const summaryBalEl = document.getElementById('summary-balance');

        if (emailEl) emailEl.innerText = this.userEmail;
        const formattedBal = '₹' + this.formatNumber(this.userBalance);
        if (navBalEl) navBalEl.innerText = formattedBal;
        if (dockBalEl) dockBalEl.innerText = formattedBal;
        if (summaryBalEl) summaryBalEl.innerText = formattedBal;

        // Persist session to localStorage
        localStorage.setItem('userEmail', this.userEmail);
        localStorage.setItem('userBalance', this.userBalance);
        localStorage.setItem('userPositions', JSON.stringify(this.positions));
    }

    // Generate historical candles
    generateHistoricalData(symbolName) {
        const item = this.markets.find(m => m.symbol === symbolName) || this.markets[0];
        let basePrice = item.price;
        const count = 120;
        const candles = [];
        const now = Date.now();
        const tfSeconds = this.getTimeframeSeconds();

        for (let i = count; i >= 0; i--) {
            const time = now - (i * tfSeconds * 1000);
            const volatility = basePrice * 0.003;
            const change = (Math.random() - 0.49) * volatility;
            const open = basePrice;
            const close = open + change;
            const high = Math.max(open, close) + Math.random() * volatility * 0.5;
            const low = Math.min(open, close) - Math.random() * volatility * 0.5;
            const volume = Math.floor(Math.random() * 50000 + 10000);

            candles.push({ time, open, high, low, close, volume });
            basePrice = close;
        }
        this.chartData = candles;
    }

    getTimeframeSeconds() {
        switch(this.activeTimeframe) {
            case '1m': return 60;
            case '5m': return 300;
            case '15m': return 900;
            case '1h': return 3600;
            case '4h': return 14400;
            case '1D': return 86400;
            case '1W': return 604800;
            default: return 300;
        }
    }

    setupDOMEventListeners() {
        // Theme Toggle Button
        const themeBtn = document.getElementById('btn-theme-toggle');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                document.body.classList.toggle('dark-theme');
                const isDark = document.body.classList.contains('dark-theme');
                themeBtn.innerHTML = isDark ? '🌙 Dark' : '☀️ Light';
                this.renderChart();
            });
        }

        // Timeframe Buttons
        document.querySelectorAll('.tf-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tf = e.currentTarget.getAttribute('data-tf');
                if (!tf) return;
                document.querySelectorAll('.tf-btn[data-tf]').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.activeTimeframe = tf;
                this.generateHistoricalData(this.activeSymbol);
                this.renderChart();
            });
        });

        // Sidebar Tabs
        document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTab = e.currentTarget.getAttribute('data-tab');
                document.querySelectorAll('.sidebar-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                
                e.currentTarget.classList.add('active');
                const pane = document.getElementById(`tab-pane-${targetTab}`);
                if (pane) pane.classList.add('active');
            });
        });

        // Left Rail Drawing Tools
        document.querySelectorAll('.rail-tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.rail-tool-btn').forEach(b => b.classList.remove('active'));
                const tool = e.currentTarget.getAttribute('data-tool');
                if (tool !== 'trash') {
                    e.currentTarget.classList.add('active');
                    this.activeTool = tool;
                }
            });
        });

        // Watchlist Filter Buttons
        document.querySelectorAll('.wl-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cat = e.currentTarget.getAttribute('data-cat');
                if (cat) {
                    document.querySelectorAll('.wl-filter-btn').forEach(b => b.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    this.renderWatchlist(cat);
                }
            });
        });

        // Search Trigger Modal
        const searchTrigger = document.getElementById('symbol-search-btn');
        const modalOverlay = document.getElementById('search-modal-overlay');
        const modalClose = document.getElementById('search-modal-close');

        if (searchTrigger && modalOverlay) {
            searchTrigger.addEventListener('click', () => modalOverlay.style.display = 'flex');
            if (modalClose) modalClose.addEventListener('click', () => modalOverlay.style.display = 'none');
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) modalOverlay.style.display = 'none';
            });
        }

        // Quick Order Side Toggle (Buy / Sell)
        const buySideBtn = document.getElementById('order-side-buy');
        const sellSideBtn = document.getElementById('order-side-sell');
        const placeOrderBtn = document.getElementById('btn-place-order');

        if (buySideBtn && sellSideBtn) {
            buySideBtn.addEventListener('click', () => {
                buySideBtn.classList.add('active');
                sellSideBtn.classList.remove('active');
                placeOrderBtn.style.background = 'var(--tv-blue)';
                placeOrderBtn.innerText = `BUY ${this.activeSymbol}`;
            });
            sellSideBtn.addEventListener('click', () => {
                sellSideBtn.classList.add('active');
                buySideBtn.classList.remove('active');
                placeOrderBtn.style.background = 'var(--tv-red)';
                placeOrderBtn.innerText = `SELL ${this.activeSymbol}`;
            });
        }

        if (placeOrderBtn) {
            placeOrderBtn.addEventListener('click', () => this.handleOrderSubmit());
        }

        // Quantity Quick Sliders
        document.querySelectorAll('.slider-pct-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pct = parseInt(e.target.getAttribute('data-pct'));
                const qtyInput = document.getElementById('order-qty-input');
                const currMarket = this.markets.find(m => m.symbol === this.activeSymbol);
                if (currMarket && qtyInput) {
                    const allocatedAmount = (this.userBalance * (pct / 100));
                    const calcQty = Math.floor(allocatedAmount / currMarket.price);
                    qtyInput.value = Math.max(1, calcQty);
                    this.updateOrderSummary();
                }
            });
        });

        // Quantity Input change listener
        const qtyInput = document.getElementById('order-qty-input');
        if (qtyInput) {
            qtyInput.addEventListener('input', () => this.updateOrderSummary());
        }
    }

    updateOrderSummary() {
        const qtyInput = document.getElementById('order-qty-input');
        const curr = this.markets.find(m => m.symbol === this.activeSymbol);
        if (curr && qtyInput) {
            const qty = parseInt(qtyInput.value || 1);
            const marginReq = curr.price * qty;
            const summaryMargin = document.getElementById('summary-margin');
            if (summaryMargin) summaryMargin.innerText = '₹' + this.formatNumber(marginReq);
        }
    }

    renderWatchlist(categoryFilter = 'All') {
        const container = document.getElementById('watchlist-rows-container');
        if (!container) return;

        let filtered = this.markets;
        if (categoryFilter !== 'All') {
            filtered = this.markets.filter(m => m.category.toLowerCase() === categoryFilter.toLowerCase());
            if (filtered.length === 0) filtered = this.markets;
        }

        container.innerHTML = filtered.map(m => {
            const isSelected = m.symbol === this.activeSymbol ? 'selected' : '';
            const changeClass = m.change >= 0 ? 'up' : 'down';
            const changeSign = m.change >= 0 ? '+' : '';

            return `
                <div class="watchlist-row ${isSelected}" onclick="window.tradingApp.selectSymbol('${m.symbol}')">
                    <div class="symbol-name-col">
                        <span>${m.symbol}</span>
                    </div>
                    <div class="price-col">₹${this.formatNumber(m.price)}</div>
                    <div class="change-col ${changeClass}">${changeSign}${m.change.toFixed(2)}</div>
                    <div class="change-col ${changeClass}">${changeSign}${m.changePct.toFixed(2)}%</div>
                </div>
            `;
        }).join('');
    }

    renderMarquee() {
        const track = document.getElementById('ticker-marquee-track');
        if (!track) return;
        const items = [...this.markets, ...this.markets];

        track.innerHTML = items.map(m => {
            const changeClass = m.change >= 0 ? 'up' : 'down';
            const changeSign = m.change >= 0 ? '+' : '';
            return `
                <div class="ticker-item" onclick="window.tradingApp.selectSymbol('${m.symbol}')">
                    <span class="symbol">${m.symbol}</span>
                    <span class="price">₹${this.formatNumber(m.price)}</span>
                    <span class="change ${changeClass}">${changeSign}${m.changePct.toFixed(2)}%</span>
                </div>
            `;
        }).join('');
    }

    selectSymbol(symbolName) {
        this.activeSymbol = symbolName;
        this.generateHistoricalData(symbolName);
        this.renderWatchlist();
        this.renderSymbolDetails();
        this.renderOrderBook();
        this.renderChart();

        const item = this.markets.find(m => m.symbol === symbolName);
        if (item) {
            const label = document.getElementById('current-symbol-label');
            const badge = document.getElementById('chart-symbol-badge');
            if (label) label.innerText = item.symbol;
            if (badge) badge.innerText = item.name;

            const btnPlaceOrder = document.getElementById('btn-place-order');
            const sideBtn = document.querySelector('.side-btn.active');
            const side = sideBtn ? sideBtn.innerText : 'BUY';
            if (btnPlaceOrder) btnPlaceOrder.innerText = `${side} ${item.symbol}`;
            this.updateOrderSummary();
        }
    }

    renderSymbolDetails() {
        const item = this.markets.find(m => m.symbol === this.activeSymbol) || this.markets[0];
        const container = document.getElementById('instrument-detail-card');
        if (!container) return;

        const changeClass = item.change >= 0 ? 'up' : 'down';
        const changeSign = item.change >= 0 ? '+' : '';

        container.innerHTML = `
            <div class="detail-header">
                <div>
                    <div class="detail-title">${item.symbol}</div>
                    <div class="detail-subtitle">${item.name}</div>
                </div>
                <div class="market-status-pill">
                    <span class="dot"></span> ${item.status}
                </div>
            </div>
            
            <div>
                <div class="big-price-display">₹${this.formatNumber(item.price)}</div>
                <div class="price-change-sub ${changeClass}">
                    ${changeSign}₹${item.change.toFixed(2)} (${changeSign}${item.changePct.toFixed(2)}%)
                </div>
            </div>

            <!-- Performance Grid (6 Box) -->
            <div class="performance-grid-container">
                <div class="perf-title">Performance Metrics</div>
                <div class="perf-grid">
                    <div class="perf-box">
                        <div class="perf-val ${item.perf.w1.startsWith('+') ? 'up' : 'down'}">${item.perf.w1}</div>
                        <div class="perf-lbl">1W</div>
                    </div>
                    <div class="perf-box">
                        <div class="perf-val ${item.perf.m1.startsWith('+') ? 'up' : 'down'}">${item.perf.m1}</div>
                        <div class="perf-lbl">1M</div>
                    </div>
                    <div class="perf-box">
                        <div class="perf-val ${item.perf.m3.startsWith('+') ? 'up' : 'down'}">${item.perf.m3}</div>
                        <div class="perf-lbl">3M</div>
                    </div>
                    <div class="perf-box">
                        <div class="perf-val ${item.perf.m6.startsWith('+') ? 'up' : 'down'}">${item.perf.m6}</div>
                        <div class="perf-lbl">6M</div>
                    </div>
                    <div class="perf-box">
                        <div class="perf-val ${item.perf.ytd.startsWith('+') ? 'up' : 'down'}">${item.perf.ytd}</div>
                        <div class="perf-lbl">YTD</div>
                    </div>
                    <div class="perf-box">
                        <div class="perf-val ${item.perf.y1.startsWith('+') ? 'up' : 'down'}">${item.perf.y1}</div>
                        <div class="perf-lbl">1Y</div>
                    </div>
                </div>
            </div>

            <!-- Technical Sentiment Gauge -->
            <div class="technical-meter-card">
                <div style="width:100%; display:flex; justify-content:space-between; font-size:10px; font-weight:700;">
                    <span>Technical Summary</span>
                    <span style="color:var(--tv-blue);">${item.sentiment > 60 ? 'BUY' : item.sentiment < 40 ? 'SELL' : 'NEUTRAL'}</span>
                </div>
                <div class="meter-bar-track">
                    <div class="meter-pointer" style="left: ${item.sentiment}%;"></div>
                </div>
                <div class="meter-labels">
                    <span>Strong Sell</span>
                    <span>Neutral</span>
                    <span>Strong Buy</span>
                </div>
            </div>
        `;
    }

    renderOrderBook() {
        const container = document.getElementById('order-book-list');
        if (!container) return;

        const curr = this.markets.find(m => m.symbol === this.activeSymbol) || this.markets[0];
        let asks = [];
        let bids = [];

        for (let i = 5; i >= 1; i--) {
            const price = curr.price + (i * curr.price * 0.0004);
            const size = (Math.random() * 200 + 10).toFixed(0);
            asks.push({ price, size });
        }

        for (let i = 1; i <= 5; i++) {
            const price = curr.price - (i * curr.price * 0.0004);
            const size = (Math.random() * 200 + 10).toFixed(0);
            bids.push({ price, size });
        }

        let html = '';
        asks.forEach(a => {
            const pct = Math.min(100, (a.size / 250) * 100);
            html += `
                <div class="ob-row ask">
                    <span class="price">₹${this.formatNumber(a.price)}</span>
                    <span style="text-align:right;">${a.size}</span>
                    <span style="text-align:right;">₹${(a.price * a.size).toFixed(0)}</span>
                    <div class="bar" style="width:${pct}%;"></div>
                </div>
            `;
        });

        html += `<div style="padding:4px; text-align:center; font-weight:800; border-y:1px solid var(--tv-border); color:var(--tv-blue);">₹${this.formatNumber(curr.price)}</div>`;

        bids.forEach(b => {
            const pct = Math.min(100, (b.size / 250) * 100);
            html += `
                <div class="ob-row bid">
                    <span class="price">₹${this.formatNumber(b.price)}</span>
                    <span style="text-align:right;">${b.size}</span>
                    <span style="text-align:right;">₹${(b.price * b.size).toFixed(0)}</span>
                    <div class="bar" style="width:${pct}%;"></div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // Render Full Portfolio Holdings View & Dock Positions
    renderPortfolioUI() {
        const portfolioPane = document.getElementById('portfolio-content');
        const posCountEl = document.getElementById('dock-pos-count');
        if (posCountEl) posCountEl.innerText = this.positions.length;

        if (!portfolioPane) return;

        if (this.positions.length === 0) {
            portfolioPane.innerHTML = `
                <div style="font-size:11px; font-weight:700; color:var(--tv-text-secondary); display:flex; justify-content:space-between;">
                    <span>Portfolio Holdings</span>
                    <a href="portfolio.html" style="color:var(--tv-blue); text-decoration:none;">View Full Page ↗</a>
                </div>
                <div style="color:var(--tv-text-secondary); text-align:center; padding:25px; font-size:12px; border:1px dashed var(--tv-border); border-radius:6px;">
                    <i class="fas fa-folder-open" style="font-size:24px; margin-bottom:8px; display:block; color:var(--tv-text-muted);"></i>
                    No active holdings. Execute a Buy or Sell order to build your portfolio!
                </div>
            `;
            return;
        }

        let totalValue = 0;
        let totalPnl = 0;

        let rowsHtml = this.positions.map((pos, idx) => {
            const currMarket = this.markets.find(m => m.symbol === pos.symbol);
            const currPrice = currMarket ? currMarket.price : pos.entryPrice;
            const diff = (currPrice - pos.entryPrice) * (pos.side === 'BUY' ? 1 : -1);
            const pnlVal = diff * pos.qty;
            const pnlPct = (diff / pos.entryPrice) * 100;

            totalValue += (currPrice * pos.qty);
            totalPnl += pnlVal;

            const pnlClass = pnlVal >= 0 ? 'up' : 'down';
            const pnlSign = pnlVal >= 0 ? '+' : '';

            return `
                <div style="background:var(--tv-bg-surface); border:1px solid var(--tv-border); padding:8px; border-radius:6px; font-size:11px; display:flex; flex-direction:column; gap:4px;">
                    <div style="display:flex; justify-content:space-between; font-weight:800;">
                        <span>${pos.symbol} <span style="font-size:9px; color:${pos.side === 'BUY' ? 'var(--tv-green)' : 'var(--tv-red)'}; padding:1px 4px; border-radius:3px; background:var(--tv-bg-active);">${pos.side}</span></span>
                        <span class="change-col ${pnlClass}">${pnlSign}₹${this.formatNumber(pnlVal)} (${pnlSign}${pnlPct.toFixed(2)}%)</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; color:var(--tv-text-secondary); font-size:10px;">
                        <span>Qty: ${pos.qty} • Avg: ₹${this.formatNumber(pos.entryPrice)}</span>
                        <span>Current: ₹${this.formatNumber(currPrice)}</span>
                    </div>
                    <button onclick="window.tradingApp.closePosition(${idx})" style="background:var(--tv-red-bg); color:var(--tv-red); border:1px solid var(--tv-red); border-radius:4px; padding:3px; font-size:10px; font-weight:700; cursor:pointer; margin-top:4px;">
                        Close Position
                    </button>
                </div>
            `;
        }).join('');

        portfolioPane.innerHTML = `
            <div style="font-size:11px; font-weight:700; color:var(--tv-text-secondary); display:flex; justify-content:space-between;">
                <span>Portfolio Holdings (${this.positions.length})</span>
                <a href="portfolio.html" style="color:var(--tv-blue); text-decoration:none;">View Analytics ↗</a>
            </div>
            <div style="background:var(--tv-bg-surface); padding:8px; border-radius:6px; border:1px solid var(--tv-border); display:flex; justify-content:space-between; font-size:11px;">
                <div>
                    <div style="color:var(--tv-text-secondary); font-size:10px;">Invested Val</div>
                    <div style="font-weight:800;">₹${this.formatNumber(totalValue)}</div>
                </div>
                <div style="text-align:right;">
                    <div style="color:var(--tv-text-secondary); font-size:10px;">Unrealized P&L</div>
                    <div style="font-weight:800;" class="${totalPnl >= 0 ? 'up' : 'down'}">${totalPnl >= 0 ? '+' : ''}₹${this.formatNumber(totalPnl)}</div>
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                ${rowsHtml}
            </div>
        `;
    }

    closePosition(index) {
        if (index >= 0 && index < this.positions.length) {
            const pos = this.positions[index];
            const currMarket = this.markets.find(m => m.symbol === pos.symbol);
            const exitPrice = currMarket ? currMarket.price : pos.entryPrice;
            const returnVal = (exitPrice * pos.qty);

            this.userBalance += returnVal;
            this.positions.splice(index, 1);
            this.updateUserSessionUI();
            this.renderPortfolioUI();
            alert(`Position Closed: ${pos.symbol} returned ₹${this.formatNumber(returnVal)} to wallet balance!`);
        }
    }

    initCanvasChart() {
        this.canvas = document.getElementById('mainChartCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        const resize = () => {
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = rect.width * window.devicePixelRatio;
            this.canvas.height = rect.height * window.devicePixelRatio;
            this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            this.renderChart();
        };

        window.addEventListener('resize', resize);
        resize();

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.crosshairPos = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            this.renderChart();
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.crosshairPos = { x: -1, y: -1 };
            this.renderChart();
        });
    }

    renderChart() {
        if (!this.canvas || !this.ctx) return;
        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;
        const ctx = this.ctx;

        const isDark = document.body.classList.contains('dark-theme');
        const bgMain = isDark ? '#131722' : '#ffffff';
        const gridColor = isDark ? 'rgba(240, 243, 250, 0.06)' : 'rgba(42, 46, 57, 0.06)';
        const textColor = isDark ? '#787b86' : '#787b86';
        const greenCandle = '#089981';
        const redCandle = '#f23645';

        ctx.fillStyle = bgMain;
        ctx.fillRect(0, 0, width, height);

        if (!this.chartData || this.chartData.length === 0) return;

        const pricePadding = 50;
        const bottomPadding = 26;
        const chartW = width - pricePadding;
        const chartH = height - bottomPadding;

        let minPrice = Infinity;
        let maxPrice = -Infinity;

        this.chartData.forEach(c => {
            if (c.low < minPrice) minPrice = c.low;
            if (c.high > maxPrice) maxPrice = c.high;
        });

        const priceRange = (maxPrice - minPrice) || 1;
        const candleWidth = chartW / this.chartData.length;

        // Gridlines
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;

        for (let i = 1; i <= 5; i++) {
            const y = (chartH / 6) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(chartW, y);
            ctx.stroke();

            const priceVal = maxPrice - (priceRange / 6) * i;
            ctx.fillStyle = textColor;
            ctx.font = '10px Inter, sans-serif';
            ctx.fillText('₹' + priceVal.toFixed(2), chartW + 4, y + 3);
        }

        for (let i = 0; i < this.chartData.length; i += 20) {
            const x = i * candleWidth;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, chartH);
            ctx.stroke();
        }

        let activeCandle = null;

        // Draw Candlesticks & Volume
        this.chartData.forEach((c, idx) => {
            const x = idx * candleWidth + candleWidth / 2;
            const openY = chartH - ((c.open - minPrice) / priceRange) * chartH;
            const closeY = chartH - ((c.close - minPrice) / priceRange) * chartH;
            const highY = chartH - ((c.high - minPrice) / priceRange) * chartH;
            const lowY = chartH - ((c.low - minPrice) / priceRange) * chartH;

            const isUp = c.close >= c.open;
            const color = isUp ? greenCandle : redCandle;

            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, highY);
            ctx.lineTo(x, lowY);
            ctx.stroke();

            const bodyY = Math.min(openY, closeY);
            const bodyH = Math.max(Math.abs(closeY - openY), 2);
            const bodyW = Math.max(candleWidth * 0.7, 3);

            ctx.fillStyle = color;
            ctx.fillRect(x - bodyW / 2, bodyY, bodyW, bodyH);

            if (this.indicators.volume) {
                const maxVol = 70000;
                const volH = (c.volume / maxVol) * (chartH * 0.2);
                ctx.fillStyle = isUp ? 'rgba(8, 153, 129, 0.2)' : 'rgba(242, 54, 69, 0.2)';
                ctx.fillRect(x - bodyW / 2, chartH - volH, bodyW, volH);
            }

            if (this.crosshairPos.x >= x - candleWidth / 2 && this.crosshairPos.x <= x + candleWidth / 2) {
                activeCandle = c;
            }
        });

        // Header OHLC
        const displayCandle = activeCandle || this.chartData[this.chartData.length - 1];
        if (displayCandle) {
            const o = document.getElementById('ohlc-o');
            const h = document.getElementById('ohlc-h');
            const l = document.getElementById('ohlc-l');
            const c = document.getElementById('ohlc-c');
            const v = document.getElementById('ohlc-v');
            if (o) o.innerText = displayCandle.open.toFixed(2);
            if (h) h.innerText = displayCandle.high.toFixed(2);
            if (l) l.innerText = displayCandle.low.toFixed(2);
            if (c) c.innerText = displayCandle.close.toFixed(2);
            if (v) v.innerText = displayCandle.volume.toLocaleString();
        }

        // Crosshair
        if (this.crosshairPos.x > 0 && this.crosshairPos.x < chartW && this.crosshairPos.y > 0 && this.crosshairPos.y < chartH) {
            ctx.strokeStyle = isDark ? '#ffffff' : '#131722';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.moveTo(this.crosshairPos.x, 0);
            ctx.lineTo(this.crosshairPos.x, chartH);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, this.crosshairPos.y);
            ctx.lineTo(chartW, this.crosshairPos.y);
            ctx.stroke();

            ctx.setLineDash([]);

            const hoverPrice = maxPrice - (this.crosshairPos.y / chartH) * priceRange;
            ctx.fillStyle = '#2962ff';
            ctx.fillRect(chartW, this.crosshairPos.y - 10, pricePadding, 20);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.fillText('₹' + hoverPrice.toFixed(2), chartW + 2, this.crosshairPos.y + 3);
        }
    }

    startPriceSimulation() {
        setInterval(() => {
            this.markets.forEach(m => {
                const delta = (Math.random() - 0.49) * (m.price * 0.001);
                m.price += delta;
                m.change += delta;
                m.changePct = (m.change / m.prevClose) * 100;
            });

            if (this.chartData.length > 0) {
                const last = this.chartData[this.chartData.length - 1];
                const active = this.markets.find(m => m.symbol === this.activeSymbol);
                if (active) {
                    last.close = active.price;
                    if (active.price > last.high) last.high = active.price;
                    if (active.price < last.low) last.low = active.price;
                }
            }

            this.renderWatchlist();
            this.renderMarquee();
            this.renderSymbolDetails();
            this.renderOrderBook();
            this.renderPortfolioUI();
            this.renderChart();
        }, 1500);
    }

    handleOrderSubmit() {
        const sideBtn = document.querySelector('.side-btn.active');
        const side = sideBtn ? sideBtn.innerText.includes('SELL') ? 'SELL' : 'BUY' : 'BUY';
        const qtyInput = document.getElementById('order-qty-input');
        const qty = parseInt(qtyInput ? qtyInput.value : '1') || 1;
        const curr = this.markets.find(m => m.symbol === this.activeSymbol);
        
        if (!curr) return;
        const totalVal = curr.price * qty;

        if (totalVal > this.userBalance) {
            alert('Insufficient Balance! Click "+ Add Funds" to deposit virtual margin.');
            return;
        }

        this.userBalance -= totalVal;
        this.positions.push({
            symbol: curr.symbol,
            side: side,
            qty: qty,
            entryPrice: curr.price,
            timestamp: new Date().toISOString()
        });

        this.updateUserSessionUI();
        this.renderPortfolioUI();
        alert(`Order Placed: ${side} ${qty} ${curr.symbol} @ ₹${this.formatNumber(curr.price)}`);
    }

    formatNumber(num) {
        return (num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.tradingApp = new RealTradingPlatform();
});
