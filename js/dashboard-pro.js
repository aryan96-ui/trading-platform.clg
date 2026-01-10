// ProTrader - Professional Trading Platform
class ProTrader {
    constructor() {
        this.user = {
            email: localStorage.getItem('userEmail') || 'demo@college.com',
            balance: 100000,
            portfolio: {}
        };
        this.selectedSymbol = 'BTC';
        this.selectedAssetType = 'crypto';
        this.marketData = {};
        this.chart = null;
        this.miniChart = null;
        this.tradeHistory = [];

        this.init();
    }

    async init() {
        console.log('ProTrader: Initializing...');
        // Generate mock data first so UI has something to display
        this.generateMockData();

        await this.loadUserData();
        this.updateUI();
        this.setupEventListeners();

        // Populate watchlist with mock data before fetching real data
        this.populateWatchlist();

        // Try to fetch real market data (this will override mock if successful)
        await this.fetchMarketData();

        this.updateSymbolOptions();
        this.updateCurrentPrice();
        this.initializeCharts();
        this.startDataRefresh();

        console.log('ProTrader: Initialization complete');
    }

    async loadUserData() {
        const email = this.user.email;
        try {
            // Load portfolio
            const portfolioResponse = await fetch(`/api/portfolio/${email}`);
            const portfolioData = await portfolioResponse.json();
            if (portfolioData.success) {
                this.user.portfolio = portfolioData.portfolio || {};
                console.log('Portfolio loaded:', this.user.portfolio);
            }

            // Load trade history
            const historyResponse = await fetch(`/api/history/${email}`);
            const historyData = await historyResponse.json();
            if (historyData.success) {
                this.tradeHistory = historyData.history || [];
                console.log('Trade history loaded:', this.tradeHistory.length, 'trades');
                this.displayTradeHistory();
            }

            // Get user balance from login (stored in localStorage)
            const storedBalance = localStorage.getItem('userBalance');
            if (storedBalance) {
                this.user.balance = parseFloat(storedBalance);
            }

            // Display portfolio
            this.displayPortfolio();
        } catch (error) {
            console.log('Error loading user data:', error);
            console.log('Using demo mode');
        }
    }

    displayPortfolio() {
        console.log('Displaying portfolio...');
        // Portfolio will be displayed in the UI if needed
        // For now, it's tracked internally for trading calculations
        if (Object.keys(this.user.portfolio).length > 0) {
            console.log('Portfolio holdings:', this.user.portfolio);
        } else {
            console.log('Portfolio is empty. Start trading to build your portfolio!');
        }
    }

    displayTradeHistory() {
        const historyContainer = document.getElementById('history-container');
        if (!historyContainer) return;

        console.log('Displaying', this.tradeHistory.length, 'trades in history');

        if (this.tradeHistory.length === 0) {
            historyContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
                    <p>No trades yet</p>
                    <p style="font-size: 12px; margin-top: 8px;">Make your first trade to see it here!</p>
                </div>
            `;
            return;
        }

        // Display last 10 trades
        const recentTrades = this.tradeHistory.slice(-10).reverse();
        historyContainer.innerHTML = recentTrades.map(trade => {
            const typeClass = trade.type === 'buy' ? 'type-buy' : 'type-sell';
            return `
                <div class="history-row">
                    <div class="history-type ${typeClass}">${trade.type.toUpperCase()}</div>
                    <div class="history-asset">${trade.symbol}</div>
                    <div class="history-amount">${this.formatNumber(trade.price || trade.totalAmount)}</div>
                </div>
            `;
        }).join('');
    }

    updateUI() {
        // Update user email display
        const emailDisplay = document.getElementById('user-email');
        if (emailDisplay) {
            emailDisplay.textContent = this.user.email;
        }

        // Update balance
        const balanceEl = document.getElementById('user-balance');
        if (balanceEl) {
            balanceEl.textContent = this.formatCurrency(this.user.balance);
        }
    }

    setupEventListeners() {
        // Asset type selector
        const assetType = document.getElementById('asset-type');
        if (assetType) {
            assetType.addEventListener('change', (e) => {
                this.selectedAssetType = e.target.value;
                this.updateSymbolOptions();
            });
        }

        // Symbol selector
        const symbolSelect = document.getElementById('trade-symbol');
        if (symbolSelect) {
            symbolSelect.addEventListener('change', (e) => {
                this.selectedSymbol = e.target.value;
                this.updateCurrentPrice();
            });
        }

        // Time interval buttons
        document.querySelectorAll('.interval-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateChartTimeframe(e.target.dataset.interval);
            });
        });

        // Chart tool buttons
        document.querySelectorAll('.chart-tool').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chart-tool').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.handleChartTool(e.target.dataset.tool);
            });
        });
    }

    async fetchMarketData() {
        try {
            console.log('Fetching market data from /api/market-data...');
            const response = await fetch('/api/market-data');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Market data received:', Object.keys(data));

            this.marketData = data;
            this.updateWatchlist();
            this.updateCurrentPrice();
            this.updateSymbolOptions();
        } catch (error) {
            console.error('Failed to fetch market data:', error);
            console.log('Using mock data instead');
            // Mock data is already generated in init(), so just update UI
            this.updateWatchlist();
            this.updateCurrentPrice();
            this.updateSymbolOptions();
        }
    }

    generateMockData() {
        this.marketData = {
            stocks: {
                'RELIANCE': { price: 2450.35, change: 1.24 },
                'TCS': { price: 3261.35, change: 2.84 },
                'HDFC': { price: 1625.02, change: -0.90 },
                'INFY': { price: 1510.43, change: 3.25 },
                'SBIN': { price: 585.60, change: 1.45 },
                'ICICI': { price: 950.30, change: -1.20 },
                'BHARTI': { price: 890.45, change: 0.80 },
                'ITC': { price: 420.80, change: -0.50 }
            },
            crypto: {
                'BTC': { price: 48250.75, change: 2.45 },
                'ETH': { price: 3253.80, change: 1.75 },
                'ADA': { price: 45.20, change: -1.20 },
                'SOL': { price: 6520.50, change: 4.50 },
                'XRP': { price: 52.30, change: 2.10 }
            },
            forex: {
                'USD/INR': { price: 83.50, change: 0.15 },
                'EUR/INR': { price: 90.20, change: -0.25 },
                'GBP/INR': { price: 105.80, change: 0.50 },
                'JPY/INR': { price: 0.56, change: 0.05 }
            },
            commodities: {
                'GOLD': { price: 5500, change: 1.20 },
                'SILVER': { price: 68, change: -0.80 },
                'CRUDE': { price: 6200, change: 2.10 }
            }
        };
    }

    populateWatchlist() {
        const container = document.getElementById('watchlist-container');
        if (!container) return;

        const watchlistItems = [
            { symbol: 'RELIANCE', type: 'stocks', color: 'green' },
            { symbol: 'TCS', type: 'stocks', color: 'blue' },
            { symbol: 'ETH', type: 'crypto', color: 'blue' },
            { symbol: 'HDFC', type: 'stocks', color: 'green' }
        ];

        container.innerHTML = watchlistItems.map(item => {
            const data = this.marketData[item.type]?.[item.symbol] || { price: 0, change: 0 };
            const changeClass = data.change >= 0 ? 'positive' : 'negative';
            const arrow = data.change >= 0 ? '▲' : '▼';

            return `
                <div class="watchlist-item" onclick="proTrader.selectWatchlistItem('${item.symbol}', '${item.type}')">
                    <div class="symbol-color ${item.color}"></div>
                    <div class="watchlist-info">
                        <div class="symbol">${item.symbol}</div>
                        <div class="price">${this.formatNumber(data.price)}</div>
                    </div>
                    <div class="change ${changeClass}">
                        ${arrow} ${Math.abs(data.change).toFixed(2)}%
                    </div>
                </div>
            `;
        }).join('');
    }

    selectWatchlistItem(symbol, type) {
        this.selectedSymbol = symbol;
        this.selectedAssetType = type;

        // Update active state
        document.querySelectorAll('.watchlist-item').forEach(item => {
            item.classList.remove('active');
        });
        event.currentTarget.classList.add('active');

        // Update chart header
        document.getElementById('current-symbol').textContent = symbol;

        // Update trade panel
        document.getElementById('asset-type').value = type;
        this.updateSymbolOptions();
        document.getElementById('trade-symbol').value = symbol;

        this.updateCurrentPrice();
        this.updateChart();
    }

    updateWatchlist() {
        this.populateWatchlist();
    }

    updateSymbolOptions() {
        const symbolSelect = document.getElementById('trade-symbol');
        if (!symbolSelect) return;

        const symbols = Object.keys(this.marketData[this.selectedAssetType] || {});
        symbolSelect.innerHTML = symbols.map(sym =>
            `<option value="${sym}">${sym}</option>`
        ).join('');

        if (symbols.length > 0) {
            this.selectedSymbol = symbols[0];
            symbolSelect.value = this.selectedSymbol;
            this.updateCurrentPrice();
        }
    }

    updateCurrentPrice() {
        const priceEl = document.getElementById('current-price');
        if (!priceEl) return;

        const data = this.marketData[this.selectedAssetType]?.[this.selectedSymbol];
        if (data) {
            priceEl.textContent = this.formatCurrency(data.price);

            // Update header change indicator
            const changeEl = document.getElementById('current-change');
            if (changeEl) {
                const changeClass = data.change >= 0 ? 'positive' : 'negative';
                changeEl.className = `symbol-change ${changeClass}`;
                changeEl.textContent = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}%`;
            }
        }
    }

    initializeCharts() {
        // Main trading chart
        const mainCanvas = document.getElementById('tradingChart');
        if (mainCanvas) {
            this.chart = this.createMainChart(mainCanvas);
        }

        // Mini market overview chart
        const miniCanvas = document.getElementById('miniChart');
        if (miniCanvas) {
            this.miniChart = this.createMiniChart(miniCanvas);
        }
    }

    createMainChart(canvas) {
        const ctx = canvas.getContext('2d');
        const chartData = this.generateChartData(60);

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: this.selectedSymbol,
                    data: chartData.prices,
                    borderColor: '#2962ff',
                    backgroundColor: 'rgba(41, 98, 255, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#141930',
                        titleColor: '#ffffff',
                        bodyColor: '#8b92b5',
                        borderColor: '#2a2f4a',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: '#2a2f4a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#8b92b5',
                            font: {
                                size: 11
                            }
                        }
                    },
                    y: {
                        position: 'right',
                        grid: {
                            color: '#2a2f4a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#8b92b5',
                            font: {
                                size: 11
                            },
                            callback: (value) => this.formatNumber(value)
                        }
                    }
                }
            }
        });
    }

    createMiniChart(canvas) {
        const ctx = canvas.getContext('2d');
        const chartData = this.generateChartData(30);

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    data: chartData.prices,
                    borderColor: '#26a69a',
                    backgroundColor: 'rgba(38, 166, 154, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 1.5,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
    }

    generateChartData(points) {
        const basePrice = this.marketData[this.selectedAssetType]?.[this.selectedSymbol]?.price || 1000;
        const labels = [];
        const prices = [];

        for (let i = points; i >= 0; i--) {
            const date = new Date();
            date.setHours(date.getHours() - i);
            labels.push(date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));

            const variance = (Math.random() - 0.5) * (basePrice * 0.02);
            prices.push(basePrice + variance);
        }

        return { labels, prices };
    }

    updateChart() {
        if (!this.chart) return;

        const chartData = this.generateChartData(60);
        this.chart.data.labels = chartData.labels;
        this.chart.data.datasets[0].data = chartData.prices;
        this.chart.data.datasets[0].label = this.selectedSymbol;
        this.chart.update();
    }

    updateChartTimeframe(interval) {
        console.log('Updating chart timeframe:', interval);
        this.updateChart();
    }

    handleChartTool(tool) {
        console.log('Chart tool selected:', tool);
        // Implement tool functionality
        this.showNotification(`${tool} tool activated`, 'info');
    }

    async executeTrade(type) {
        const amount = parseFloat(document.getElementById('trade-amount').value);
        if (!amount || amount <= 0) {
            this.showNotification('Please enter a valid amount', 'error');
            return;
        }

        const price = this.marketData[this.selectedAssetType]?.[this.selectedSymbol]?.price || 0;
        const totalCost = amount * price;

        if (type === 'buy' && totalCost > this.user.balance) {
            this.showNotification('Insufficient balance', 'error');
            return;
        }

        try {
            const response = await fetch('/api/trade', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': this.user.email
                },
                body: JSON.stringify({
                    email: this.user.email,
                    symbol: this.selectedSymbol,
                    type: type,
                    quantity: amount,
                    assetType: this.selectedAssetType
                })
            });

            const data = await response.json();

            if (data.success) {
                this.user.balance = data.newBalance;
                this.user.portfolio = data.portfolio;

                this.updateUI();
                this.addTradeToHistory(type, this.selectedSymbol, amount, price);

                this.showNotification(
                    `${type.toUpperCase()} order executed: ${amount} ${this.selectedSymbol}`,
                    'success'
                );
            } else {
                this.showNotification(data.message || 'Trade failed', 'error');
            }
        } catch (error) {
            console.error('Trade error:', error);
            this.showNotification('Trade execution failed', 'error');
        }
    }

    addTradeToHistory(type, symbol, amount, price) {
        // Add to internal trade history array
        const trade = {
            type: type,
            symbol: symbol,
            quantity: amount,
            price: price,
            totalAmount: amount * price,
            assetType: this.selectedAssetType,
            timestamp: new Date().toISOString()
        };
        this.tradeHistory.push(trade);

        // Update localStorage with new balance
        localStorage.setItem('userBalance', this.user.balance);

        // Update UI
        const historyContainer = document.getElementById('history-container');
        if (!historyContainer) return;

        const typeClass = type === 'buy' ? 'type-buy' : 'type-sell';
        const historyRow = document.createElement('div');
        historyRow.className = 'history-row';
        historyRow.innerHTML = `
            <div class="history-type ${typeClass}">${type.toUpperCase()}</div>
            <div class="history-asset">${symbol}</div>
            <div class="history-amount">${this.formatNumber(price)}</div>
        `;

        historyContainer.insertBefore(historyRow, historyContainer.firstChild);

        // Keep only last 10 trades visible
        while (historyContainer.children.length > 10) {
            historyContainer.removeChild(historyContainer.lastChild);
        }

        console.log('Trade added to history. Total trades:', this.tradeHistory.length);
    }

    startDataRefresh() {
        setInterval(() => {
            this.fetchMarketData();
        }, 5000);
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(amount);
    }

    formatNumber(num) {
        if (num >= 1000) {
            return new Intl.NumberFormat('en-IN').format(num);
        }
        return num.toFixed(2);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Modal functions
function showDepositModal() {
    document.getElementById('deposit-modal').style.display = 'flex';
}

function closeDepositModal() {
    document.getElementById('deposit-modal').style.display = 'none';
}

async function processDeposit() {
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    if (!amount || amount <= 0) {
        proTrader.showNotification('Please enter a valid amount', 'error');
        return;
    }

    try {
        const response = await fetch('/api/payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: proTrader.user.email,
                amount: amount
            })
        });

        const data = await response.json();

        if (data.success) {
            proTrader.user.balance = data.newBalance;
            proTrader.updateUI();
            closeDepositModal();
            proTrader.showNotification(`₹${amount.toLocaleString()} deposited successfully`, 'success');
        } else {
            proTrader.showNotification(data.message || 'Deposit failed', 'error');
        }
    } catch (error) {
        console.error('Deposit error:', error);
        proTrader.showNotification('Deposit failed', 'error');
    }
}

function showLogin() {
    window.location.href = 'login.html';
}

function logout() {
    localStorage.removeItem('userEmail');
    window.location.href = 'index.html';
}

// Initialize the platform
let proTrader;
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Starting ProTrader...');
    try {
        proTrader = new ProTrader();
        console.log('ProTrader instance created successfully');
    } catch (error) {
        console.error('Failed to initialize ProTrader:', error);
        alert('Failed to initialize trading platform. Check console for details.');
    }
});
