// dashboard-standalone.js - Standalone version with built-in mock data
class TradingPlatform {
    constructor() {
        // Use demo user for standalone mode or load from localStorage
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            this.user = JSON.parse(savedUser);
            this.user.balance = this.user.balance || 100000;
            this.user.portfolio = this.user.portfolio || {};
        } else {
            this.user = {
                email: 'demo@college.com',
                balance: 100000,
                portfolio: {}
            };
        }

        this.isPremium = false;
        this.currentAssetType = 'stocks';
        this.currentSymbol = 'RELIANCE';
        this.marketData = null;
        this.chart = null;
        this.refreshInterval = null;

        this.init();
    }

    async init() {
        this.updateUserUI();
        this.checkPremiumStatus();
        this.generateMockMarketData();
        this.setupEventListeners();
        this.initChart();
        this.updateWatchlist();
        this.updateTicker();
        this.updateCurrentPrice();
        this.updateLastUpdated();

        // Auto-refresh every 5 seconds with slight price changes
        this.refreshInterval = setInterval(() => this.refreshMarketData(), 5000);
    }

    generateMockMarketData() {
        this.marketData = {
            stocks: {
                'RELIANCE': { price: 2450.25 + (Math.random() - 0.5) * 50, change: 2.35 + (Math.random() - 0.5) * 2 },
                'TCS': { price: 3278.50 + (Math.random() - 0.5) * 100, change: 1.85 + (Math.random() - 0.5) * 2 },
                'HDFC': { price: 1645.75 + (Math.random() - 0.5) * 50, change: -0.45 + (Math.random() - 0.5) * 2 },
                'INFY': { price: 1520.40 + (Math.random() - 0.5) * 40, change: 3.25 + (Math.random() - 0.5) * 2 },
                'SBIN': { price: 585.60 + (Math.random() - 0.5) * 30, change: -1.15 + (Math.random() - 0.5) * 2 },
                'ICICI': { price: 950.30 + (Math.random() - 0.5) * 40, change: 0.85 + (Math.random() - 0.5) * 2 },
                'BHARTI': { price: 890.45 + (Math.random() - 0.5) * 35, change: 1.95 + (Math.random() - 0.5) * 2 },
                'ITC': { price: 420.80 + (Math.random() - 0.5) * 20, change: -0.65 + (Math.random() - 0.5) * 2 }
            },
            crypto: {
                'BTC': { price: 3500000 + (Math.random() - 0.5) * 100000, change: 4.25 + (Math.random() - 0.5) * 5 },
                'ETH': { price: 200000 + (Math.random() - 0.5) * 10000, change: 5.85 + (Math.random() - 0.5) * 5 },
                'ADA': { price: 45 + (Math.random() - 0.5) * 5, change: -2.45 + (Math.random() - 0.5) * 3 },
                'SOL': { price: 6500 + (Math.random() - 0.5) * 500, change: 8.25 + (Math.random() - 0.5) * 6 },
                'XRP': { price: 50 + (Math.random() - 0.5) * 5, change: 3.15 + (Math.random() - 0.5) * 4 }
            },
            forex: {
                'USD/INR': { price: 83.5 + (Math.random() - 0.5) * 0.5, change: 0.15 + (Math.random() - 0.5) * 0.3 },
                'EUR/INR': { price: 90.2 + (Math.random() - 0.5) * 0.8, change: -0.25 + (Math.random() - 0.5) * 0.4 },
                'GBP/INR': { price: 105.8 + (Math.random() - 0.5) * 1.2, change: 0.35 + (Math.random() - 0.5) * 0.5 },
                'JPY/INR': { price: 0.55 + (Math.random() - 0.5) * 0.05, change: -0.05 + (Math.random() - 0.5) * 0.1 }
            },
            commodities: {
                'GOLD': { price: 5500 + (Math.random() - 0.5) * 100, change: 1.25 + (Math.random() - 0.5) * 2 },
                'SILVER': { price: 68 + (Math.random() - 0.5) * 3, change: 2.45 + (Math.random() - 0.5) * 3 },
                'CRUDE': { price: 6200 + (Math.random() - 0.5) * 200, change: -1.85 + (Math.random() - 0.5) * 3 }
            },
            timestamp: new Date().toISOString()
        };
    }

    updateUserUI() {
        document.getElementById('user-email').textContent = this.user.email;
        document.getElementById('nav-balance').textContent = this.formatCurrency(this.user.balance);
        document.getElementById('available-balance').textContent = this.formatCurrency(this.user.balance);
    }

    checkPremiumStatus() {
        // Check if user is premium (from localStorage or user object)
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            const userData = JSON.parse(savedUser);
            this.isPremium = userData.isPremium || false;
        }

        const premiumBtn = document.getElementById('premium-btn');
        const premiumSection = document.getElementById('premium-section');
        const premiumPanel = document.getElementById('premium-panel');

        if (this.isPremium) {
            // User is premium - update UI
            if (premiumBtn) {
                premiumBtn.innerHTML = '<i class="fas fa-crown"></i> Premium Member';
                premiumBtn.classList.add('is-premium');
                premiumBtn.href = '#';
                premiumBtn.onclick = (e) => {
                    e.preventDefault();
                    this.showNotification('You are already a Premium member!', 'success');
                };
            }

            // Unlock all premium features
            if (premiumSection) {
                const lockedItems = premiumSection.querySelectorAll('.premium-feature-item.locked');
                lockedItems.forEach(item => {
                    item.classList.remove('locked');
                });

                // Change the upgrade button to show premium status
                const upgradeBtn = premiumSection.querySelector('.btn-get-premium');
                if (upgradeBtn) {
                    upgradeBtn.innerHTML = '<i class="fas fa-check-circle"></i> Premium Active';
                    upgradeBtn.style.background = 'linear-gradient(135deg, #26a69a 0%, #1e8a7e 100%)';
                    upgradeBtn.style.color = 'white';
                    upgradeBtn.href = '#';
                    upgradeBtn.onclick = (e) => e.preventDefault();
                }

                // Update section title
                const sectionTitle = premiumSection.querySelector('h4');
                if (sectionTitle) {
                    sectionTitle.innerHTML = '<i class="fas fa-crown"></i> Premium Features (Active)';
                }
            }

            // Show premium panel with analytics
            if (premiumPanel) {
                premiumPanel.style.display = 'block';
                // Update premium data immediately and on every refresh
                this.updatePremiumData();
            }

            console.log('✅ Premium features unlocked!');
        } else {
            // Hide premium panel for free users
            if (premiumPanel) {
                premiumPanel.style.display = 'none';
            }
            console.log('ℹ️ Free tier user - Premium features locked');
        }
    }

    updatePremiumData() {
        if (!this.isPremium || !this.marketData) return;

        const assets = this.marketData[this.currentAssetType];
        if (!assets || !assets[this.currentSymbol]) return;

        const currentPrice = assets[this.currentSymbol].price;
        const change = assets[this.currentSymbol].change;

        // Generate AI predictions
        const pred1h = currentPrice * (1 + (Math.random() - 0.3) * 0.02);
        const pred1d = currentPrice * (1 + (Math.random() - 0.3) * 0.05);
        const pred1w = currentPrice * (1 + (Math.random() - 0.3) * 0.12);

        const pred1hEl = document.getElementById('pred-1h');
        const pred1dEl = document.getElementById('pred-1d');
        const pred1wEl = document.getElementById('pred-1w');

        if (pred1hEl) {
            pred1hEl.textContent = '₹' + this.formatNumber(pred1h);
            pred1hEl.className = 'prediction-value ' + (pred1h > currentPrice ? 'positive' : 'negative');
        }
        if (pred1dEl) {
            pred1dEl.textContent = '₹' + this.formatNumber(pred1d);
            pred1dEl.className = 'prediction-value ' + (pred1d > currentPrice ? 'positive' : 'negative');
        }
        if (pred1wEl) {
            pred1wEl.textContent = '₹' + this.formatNumber(pred1w);
            pred1wEl.className = 'prediction-value ' + (pred1w > currentPrice ? 'positive' : 'negative');
        }

        // Calculate technical indicators
        const rsi = 30 + Math.random() * 40; // RSI between 30-70
        const macd = (Math.random() - 0.5) * 20;
        const bb = (currentPrice - (currentPrice * 0.95)) / (currentPrice * 0.1) * 100;
        const stoch = 20 + Math.random() * 60;

        // Update RSI
        const rsiValue = document.getElementById('rsi-value');
        const rsiSignal = document.getElementById('rsi-signal');
        if (rsiValue) rsiValue.textContent = rsi.toFixed(1);
        if (rsiSignal) {
            if (rsi > 70) {
                rsiSignal.textContent = 'Overbought';
                rsiSignal.className = 'indicator-signal bearish';
            } else if (rsi < 30) {
                rsiSignal.textContent = 'Oversold';
                rsiSignal.className = 'indicator-signal bullish';
            } else {
                rsiSignal.textContent = 'Neutral';
                rsiSignal.className = 'indicator-signal neutral';
            }
        }

        // Update MACD
        const macdValue = document.getElementById('macd-value');
        const macdSignal = document.getElementById('macd-signal');
        if (macdValue) macdValue.textContent = macd.toFixed(2);
        if (macdSignal) {
            macdSignal.textContent = macd > 0 ? 'Bullish' : 'Bearish';
            macdSignal.className = 'indicator-signal ' + (macd > 0 ? 'bullish' : 'bearish');
        }

        // Update Bollinger
        const bbValue = document.getElementById('bb-value');
        const bbSignal = document.getElementById('bb-signal');
        if (bbValue) bbValue.textContent = bb.toFixed(1) + '%';
        if (bbSignal) {
            if (bb > 80) {
                bbSignal.textContent = 'Upper Band';
                bbSignal.className = 'indicator-signal bearish';
            } else if (bb < 20) {
                bbSignal.textContent = 'Lower Band';
                bbSignal.className = 'indicator-signal bullish';
            } else {
                bbSignal.textContent = 'Mid Range';
                bbSignal.className = 'indicator-signal neutral';
            }
        }

        // Update Stochastic
        const stochValue = document.getElementById('stoch-value');
        const stochSignal = document.getElementById('stoch-signal');
        if (stochValue) stochValue.textContent = stoch.toFixed(1);
        if (stochSignal) {
            if (stoch > 80) {
                stochSignal.textContent = 'Overbought';
                stochSignal.className = 'indicator-signal bearish';
            } else if (stoch < 20) {
                stochSignal.textContent = 'Oversold';
                stochSignal.className = 'indicator-signal bullish';
            } else {
                stochSignal.textContent = 'Neutral';
                stochSignal.className = 'indicator-signal neutral';
            }
        }

        // Generate AI trading signal
        const signalStrength = Math.floor(30 + Math.random() * 70);
        let signalAction = 'HOLD';
        let signalClass = '';
        let recommendation = 'Monitor market conditions. Wait for stronger signals before entering position.';

        if (rsi < 35 && macd > 0 && signalStrength > 60) {
            signalAction = 'BUY';
            signalClass = 'buy';
            recommendation = `Strong buy signal detected. RSI at ${rsi.toFixed(1)} (oversold) with positive MACD momentum. Entry price: ₹${this.formatNumber(currentPrice)}`;
        } else if (rsi > 65 && macd < 0 && signalStrength > 60) {
            signalAction = 'SELL';
            signalClass = 'sell';
            recommendation = `Sell signal detected. RSI at ${rsi.toFixed(1)} (overbought) with negative MACD momentum. Consider profit booking.`;
        }

        const signalActionEl = document.getElementById('signal-action');
        const strengthFill = document.getElementById('strength-fill');
        const strengthText = document.getElementById('strength-text');
        const signalRec = document.getElementById('signal-rec');

        if (signalActionEl) {
            signalActionEl.textContent = signalAction;
            signalActionEl.className = 'signal-action ' + signalClass;
        }
        if (strengthFill) strengthFill.style.width = signalStrength + '%';
        if (strengthText) strengthText.textContent = signalStrength + '/100';
        if (signalRec) signalRec.textContent = recommendation;

        // Update confidence
        const confidence = Math.floor(55 + Math.random() * 35);
        const confidenceFill = document.getElementById('confidence-fill');
        const confidenceText = document.getElementById('confidence-text');
        if (confidenceFill) confidenceFill.style.width = confidence + '%';
        if (confidenceText) confidenceText.textContent = confidence + '%';
    }

    refreshMarketData() {
        // Slightly update prices to simulate live market
        if (this.marketData) {
            ['stocks', 'crypto', 'forex', 'commodities'].forEach(assetType => {
                if (!this.marketData[assetType]) return;
                Object.keys(this.marketData[assetType]).forEach(symbol => {
                    const data = this.marketData[assetType][symbol];
                    // Small random price movement (±0.5%)
                    const priceChange = data.price * (Math.random() - 0.5) * 0.01;
                    data.price += priceChange;
                    // Update change percentage
                    data.change += (Math.random() - 0.5) * 0.2;
                });
            });
        }

        this.updateWatchlist();
        this.updateTicker();
        this.updateCurrentPrice();
        this.updateLastUpdated();
        this.updateChart();
        this.updatePremiumData(); // Update premium analytics
        this.generateOptionsChain(); // Update options chain
        this.updateGreeksDisplay(); // Update Greeks
        console.log('✅ Market data refreshed:', new Date().toLocaleTimeString());
    }

    updateWatchlist() {
        if (!this.marketData) return;

        const container = document.getElementById('watchlist-content');
        container.innerHTML = '';

        const assets = this.marketData[this.currentAssetType];
        if (!assets) return;

        Object.entries(assets).forEach(([symbol, data]) => {
            const item = document.createElement('div');
            item.className = 'watchlist-item';
            item.onclick = () => this.selectSymbol(symbol);

            const changeClass = data.change >= 0 ? 'positive' : 'negative';
            const changeIcon = data.change >= 0 ? '▲' : '▼';

            item.innerHTML = `
                <div class="symbol-name">${symbol}</div>
                <div class="symbol-price">₹${this.formatNumber(data.price)}</div>
                <div class="symbol-change ${changeClass}">
                    ${changeIcon} ${Math.abs(data.change).toFixed(2)}%
                </div>
            `;
            container.appendChild(item);
        });
    }

    updateTicker() {
        if (!this.marketData) return;

        const container = document.getElementById('ticker-content');
        container.innerHTML = '';

        // Show all asset types in ticker
        ['stocks', 'crypto', 'forex', 'commodities'].forEach(assetType => {
            const assets = this.marketData[assetType];
            if (!assets) return;

            Object.entries(assets).slice(0, 3).forEach(([symbol, data]) => {
                const item = document.createElement('div');
                item.className = 'ticker-item';
                const changeClass = data.change >= 0 ? 'positive' : 'negative';

                item.innerHTML = `
                    <span class="ticker-symbol">${symbol}</span>
                    <span class="ticker-price">₹${this.formatNumber(data.price)}</span>
                    <span class="ticker-change ${changeClass}">${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}%</span>
                `;
                container.appendChild(item);
            });
        });
    }

    updateCurrentPrice() {
        if (!this.marketData) return;

        const assets = this.marketData[this.currentAssetType];
        if (!assets || !assets[this.currentSymbol]) return;

        const data = assets[this.currentSymbol];
        document.getElementById('current-asset').textContent = this.currentSymbol;
        document.getElementById('current-price').textContent = `₹${this.formatNumber(data.price)}`;

        const changeEl = document.getElementById('price-change');
        const changeClass = data.change >= 0 ? 'positive' : 'negative';
        changeEl.className = `price-change ${changeClass}`;
        changeEl.textContent = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}%`;

        // Update trade form
        document.getElementById('price').value = data.price.toFixed(2);
        this.updateTotalAmount();
    }

    updateLastUpdated() {
        const now = new Date();
        document.getElementById('last-updated').textContent = now.toLocaleTimeString();
    }

    setupEventListeners() {
        // Asset type selector
        document.querySelectorAll('.asset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.asset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentAssetType = e.target.dataset.asset;
                this.updateWatchlist();
                this.updateSymbolSelect();
                this.selectFirstSymbol();
            });
        });

        // Asset type dropdown
        document.getElementById('asset-type-select').addEventListener('change', (e) => {
            this.currentAssetType = e.target.value;
            this.updateSymbolSelect();
            this.selectFirstSymbol();
        });

        // Symbol select
        document.getElementById('symbol-select').addEventListener('change', (e) => {
            this.currentSymbol = e.target.value;
            this.updateCurrentPrice();
            this.updateChart();
        });

        // Quantity input
        document.getElementById('quantity').addEventListener('input', () => {
            this.updateTotalAmount();
        });

        // Chart time period buttons
        document.querySelectorAll('.btn-time').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.btn-time').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateChart();
            });
        });

        // Initialize symbol select
        this.updateSymbolSelect();
    }

    updateSymbolSelect() {
        const select = document.getElementById('symbol-select');
        select.innerHTML = '';

        if (!this.marketData) return;

        const assets = this.marketData[this.currentAssetType];
        if (!assets) return;

        Object.keys(assets).forEach(symbol => {
            const option = document.createElement('option');
            option.value = symbol;
            option.textContent = symbol;
            select.appendChild(option);
        });
    }

    selectFirstSymbol() {
        const select = document.getElementById('symbol-select');
        if (select.options.length > 0) {
            this.currentSymbol = select.options[0].value;
            this.updateCurrentPrice();
            this.updateChart();
        }
    }

    selectSymbol(symbol) {
        this.currentSymbol = symbol;
        document.getElementById('symbol-select').value = symbol;
        this.updateCurrentPrice();
        this.updateChart();
    }

    updateTotalAmount() {
        const quantity = parseFloat(document.getElementById('quantity').value) || 0;
        const price = parseFloat(document.getElementById('price').value) || 0;
        const total = quantity * price;
        const commission = total * 0.0005; // 0.05% commission

        document.getElementById('total-amount').textContent = this.formatCurrency(total);
        document.getElementById('commission').textContent = this.formatCurrency(commission);
    }

    placeOrder(type) {
        const quantity = parseFloat(document.getElementById('quantity').value);
        const symbol = this.currentSymbol;
        const assetType = this.currentAssetType;

        if (!quantity || quantity <= 0) {
            this.showNotification('Please enter a valid quantity', 'error');
            return;
        }

        const assets = this.marketData[this.currentAssetType];
        if (!assets || !assets[this.currentSymbol]) {
            this.showNotification('Invalid symbol', 'error');
            return;
        }

        const price = assets[this.currentSymbol].price;
        const totalAmount = quantity * price;

        // Initialize portfolio if needed
        if (!this.user.portfolio[symbol]) {
            this.user.portfolio[symbol] = { quantity: 0, avgPrice: 0, assetType };
        }

        const holding = this.user.portfolio[symbol];

        if (type === 'buy') {
            if (totalAmount > this.user.balance) {
                this.showNotification('Insufficient balance', 'error');
                return;
            }
            const newQty = holding.quantity + quantity;
            holding.avgPrice = ((holding.avgPrice * holding.quantity) + totalAmount) / newQty;
            holding.quantity = newQty;
            this.user.balance -= totalAmount;
        } else if (type === 'sell') {
            if (holding.quantity < quantity) {
                this.showNotification('Insufficient holdings', 'error');
                return;
            }
            holding.quantity -= quantity;
            this.user.balance += totalAmount;
            if (holding.quantity === 0) delete this.user.portfolio[symbol];
        }

        this.updateUserUI();
        this.updatePortfolio();

        this.showNotification(
            `${type.toUpperCase()} order executed: ${quantity} ${symbol} @ ₹${this.formatNumber(price)}`,
            'success'
        );

        document.getElementById('quantity').value = 1;
        this.updateTotalAmount();
    }

    updatePortfolio() {
        const container = document.getElementById('portfolio-content');
        container.innerHTML = '';

        const portfolio = this.user.portfolio;
        if (Object.keys(portfolio).length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">No holdings yet</p>';
            return;
        }

        Object.entries(portfolio).forEach(([symbol, holding]) => {
            const item = document.createElement('div');
            item.className = 'portfolio-item';

            // Get current price
            let currentPrice = 0;
            if (this.marketData && this.marketData[holding.assetType]) {
                const assetData = this.marketData[holding.assetType][symbol];
                if (assetData) currentPrice = assetData.price;
            }

            const currentValue = holding.quantity * currentPrice;
            const investedValue = holding.quantity * holding.avgPrice;
            const pnl = currentValue - investedValue;
            const pnlPercent = (pnl / investedValue) * 100;

            const pnlClass = pnl >= 0 ? 'positive' : 'negative';

            item.innerHTML = `
                <div style="font-weight:600;">${symbol}</div>
                <div style="font-size:0.85rem;color:var(--text-secondary);">Qty: ${holding.quantity}</div>
                <div class="${pnlClass}" style="font-size:0.85rem;font-weight:600;">
                    ${pnl >= 0 ? '+' : ''}₹${this.formatNumber(Math.abs(pnl))} (${pnlPercent.toFixed(2)}%)
                </div>
            `;
            container.appendChild(item);
        });
    }

    updateChart() {
        if (!this.chart || !this.marketData) return;

        const assets = this.marketData[this.currentAssetType];
        if (!assets || !assets[this.currentSymbol]) return;

        const currentPrice = assets[this.currentSymbol].price;
        const data = this.generateChartData(this.currentSymbol, currentPrice);

        // Update chart data
        this.chart.data.labels = data.labels;
        this.chart.data.datasets[0].data = data.prices;

        // Update border color based on trend
        const trend = data.prices[data.prices.length - 1] > data.prices[0];
        this.chart.data.datasets[0].borderColor = trend ? '#00c853' : '#ff3d3d';
        this.chart.data.datasets[0].backgroundColor = trend ? 'rgba(0, 200, 83, 0.1)' : 'rgba(255, 61, 61, 0.1)';

        this.chart.update('none'); // Update without animation
    }

    initChart() {
        const ctx = document.getElementById('tradingChart').getContext('2d');

        // Get initial price if available
        let initialPrice = 2450;
        if (this.marketData && this.marketData[this.currentAssetType] && this.marketData[this.currentAssetType][this.currentSymbol]) {
            initialPrice = this.marketData[this.currentAssetType][this.currentSymbol].price;
        }

        const data = this.generateChartData(this.currentSymbol, initialPrice);

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Price',
                    data: data.prices,
                    borderColor: '#00c853',
                    backgroundColor: 'rgba(0, 200, 83, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: '#00c853',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(30, 34, 45, 0.95)',
                        titleColor: '#8b95a5',
                        bodyColor: '#ffffff',
                        borderColor: '#1e293b',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function (context) {
                                return '₹' + context.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: '#1e293b',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#8b95a5',
                            maxTicksLimit: 10,
                            font: {
                                size: 11
                            }
                        }
                    },
                    y: {
                        grid: {
                            color: '#1e293b',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#8b95a5',
                            callback: function (value) {
                                return '₹' + value.toLocaleString('en-IN');
                            },
                            font: {
                                size: 11
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    generateOptionsChain() {
        const tbody = document.getElementById('options-tbody');
        if (!tbody) return;

        const assets = this.marketData ? this.marketData[this.currentAssetType] : null;
        if (!assets || !assets[this.currentSymbol]) return;

        const currentPrice = assets[this.currentSymbol].price;
        // Determine step size based on price level
        let step = 10;
        if (currentPrice > 10000) step = 100;
        else if (currentPrice > 5000) step = 50;
        else if (currentPrice > 1000) step = 20;
        else if (currentPrice > 500) step = 10;

        const atmStrike = Math.round(currentPrice / step) * step;
        const numStrikes = 11; // Show 5 above, ATM, 5 below
        const half = Math.floor(numStrikes / 2);

        let rows = '';
        for (let i = -half; i <= half; i++) {
            const strike = atmStrike + (i * step);
            const isATM = strike === atmStrike;
            const distance = Math.abs(strike - currentPrice) / currentPrice;

            // Call option
            const callIntrinsic = Math.max(0, currentPrice - strike);
            const callTimeValue = currentPrice * 0.02 * Math.exp(-Math.abs(i) * 0.3);
            const callLTP = callIntrinsic + callTimeValue;
            const callOI = Math.round(500000 * Math.exp(-Math.abs(i) * 0.4) + Math.random() * 50000);
            const callIV = 18 + Math.abs(i) * 1.5 + Math.random() * 3;

            // Put option
            const putIntrinsic = Math.max(0, strike - currentPrice);
            const putTimeValue = currentPrice * 0.02 * Math.exp(-Math.abs(i) * 0.3);
            const putLTP = putIntrinsic + putTimeValue;
            const putOI = Math.round(450000 * Math.exp(-Math.abs(i) * 0.35) + Math.random() * 40000);
            const putIV = 19 + Math.abs(i) * 1.5 + Math.random() * 3;

            const atmClass = isATM ? 'atm-row' : '';
            const callClass = callLTP > currentPrice * 0.05 ? 'itm' : 'otm';
            const putClass = putLTP > currentPrice * 0.05 ? 'itm' : 'otm';

            rows += `
                <tr class="${atmClass}">
                    <td class="oi-cell call-oi">${this.formatLargeNumber(callOI)}</td>
                    <td class="ltp-cell call-ltp ${callClass}" onclick="platform.selectOption('call', ${strike}, ${callLTP.toFixed(2)}, ${callIV.toFixed(1)})">₹${callLTP.toFixed(2)}</td>
                    <td class="strike-cell${isATM ? ' atm' : ''}">${strike.toLocaleString('en-IN')}</td>
                    <td class="ltp-cell put-ltp ${putClass}" onclick="platform.selectOption('put', ${strike}, ${putLTP.toFixed(2)}, ${putIV.toFixed(1)})">₹${putLTP.toFixed(2)}</td>
                    <td class="oi-cell put-oi">${this.formatLargeNumber(putOI)}</td>
                </tr>`;
        }

        tbody.innerHTML = rows;
    }

    selectOption(type, strike, ltp, iv) {
        const side = type === 'call' ? 'CE' : 'PE';
        this.selectedOption = { type, strike, ltp, iv };
        const qtyInput = document.getElementById('trade-qty');
        const priceInput = document.getElementById('trade-price');
        if (priceInput) priceInput.value = ltp;
        this.showNotification(`Selected ${strike} ${side} @ ₹${ltp} (IV: ${iv}%)`, 'success');
    }

    formatLargeNumber(num) {
        if (num >= 10000000) return (num / 10000000).toFixed(1) + 'Cr';
        if (num >= 100000) return (num / 100000).toFixed(1) + 'L';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    updateGreeksDisplay() {
        const greeksEl = document.getElementById('greeks-values');
        if (!greeksEl) return;

        const assets = this.marketData ? this.marketData[this.currentAssetType] : null;
        if (!assets || !assets[this.currentSymbol]) return;

        const currentPrice = assets[this.currentSymbol].price;
        const iv = 20 + Math.random() * 10;
        const dte = 15 + Math.floor(Math.random() * 20);
        const riskFree = 6.5;

        // ATM Greeks approximation
        const t = dte / 365;
        const sigma = iv / 100;
        const s = currentPrice;
        const k = s; // ATM
        const r = riskFree / 100;

        // Simplified Greeks
        const delta = 0.5 + (Math.random() - 0.5) * 0.1;
        const gamma = (0.001 + Math.random() * 0.002) * (1000 / s);
        const theta = -(0.5 + Math.random() * 2) * (s / 100);
        const vega = s * 0.001 * Math.sqrt(t);
        const rho = delta * t * 0.01;

        greeksEl.innerHTML = `
            <div class="greek-row">
                <span class="greek-label">Delta (Δ)</span>
                <span class="greek-value">${delta.toFixed(4)}</span>
            </div>
            <div class="greek-row">
                <span class="greek-label">Gamma (Γ)</span>
                <span class="greek-value">${gamma.toFixed(4)}</span>
            </div>
            <div class="greek-row">
                <span class="greek-label">Theta (Θ)</span>
                <span class="greek-value negative">${theta.toFixed(2)}</span>
            </div>
            <div class="greek-row">
                <span class="greek-label">Vega (ν)</span>
                <span class="greek-value">${vega.toFixed(2)}</span>
            </div>
            <div class="greek-row">
                <span class="greek-label">IV</span>
                <span class="greek-value">${iv.toFixed(1)}%</span>
            </div>
            <div class="greek-row">
                <span class="greek-label">DTE</span>
                <span class="greek-value">${dte} days</span>
            </div>
        `;
    }

    generateChartData(symbol = 'DEFAULT', currentPrice = 2450) {
        const labels = [];
        const prices = [];

        // Create a unique seed based on symbol for consistent but different patterns
        let seed = 0;
        for (let i = 0; i < symbol.length; i++) {
            seed += symbol.charCodeAt(i);
        }

        // Seeded random function for consistent patterns per symbol
        const seededRandom = (index) => {
            const x = Math.sin(seed + index) * 10000;
            return x - Math.floor(x);
        };

        // Start from a price relative to current price
        let basePrice = currentPrice * 0.92; // Start 8% below current price
        const volatility = currentPrice * 0.015; // 1.5% volatility
        const trend = (currentPrice - basePrice) / 50; // Upward trend to reach current price

        for (let i = 0; i < 50; i++) {
            // Generate time labels
            const time = new Date();
            time.setMinutes(time.getMinutes() - (50 - i) * 5);
            labels.push(time.getHours() + ':' + String(time.getMinutes()).padStart(2, '0'));

            // Add trend + random walk
            const randomChange = (seededRandom(i) - 0.5) * volatility;
            basePrice += trend + randomChange;

            prices.push(Math.max(basePrice, currentPrice * 0.7)); // Don't go below 70% of current
        }

        // Ensure last price is close to current price
        prices[prices.length - 1] = currentPrice;

        return { labels, prices };
    }

    formatCurrency(amount) {
        return '₹' + this.formatNumber(amount);
    }

    formatNumber(num) {
        return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize platform
const platform = new TradingPlatform();

// Payment modal functions
function showPaymentModal() {
    document.getElementById('payment-modal').style.display = 'block';
}

function hidePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
}

function selectAmount(amount) {
    document.getElementById('custom-amount').value = amount;
}

function processPayment() {
    const amount = parseInt(document.getElementById('custom-amount').value) || 0;

    if (amount <= 0) {
        platform.showNotification('Please enter a valid amount', 'error');
        return;
    }

    platform.user.balance += amount;
    platform.updateUserUI();
    hidePaymentModal();
    platform.showNotification(`₹${amount.toLocaleString()} added successfully!`, 'success');
}

function logout() {
    if (platform.refreshInterval) {
        clearInterval(platform.refreshInterval);
    }
    window.location.href = 'index.html';
}

// Add notification styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        top: 80px;
        right: 20px;
        background: var(--bg-surface);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        border-left: 4px solid var(--green);
        z-index: 3000;
        animation: slideIn 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 350px;
    }
    
    .notification.error {
        border-left-color: var(--red);
    }
    
    .notification i {
        font-size: 1.2rem;
    }
    
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(notificationStyles);
