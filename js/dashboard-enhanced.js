// dashboard-enhanced.js - Multi-Asset Trading Platform
class TradingPlatform {
    constructor() {
        this.user = JSON.parse(localStorage.getItem('user'));
        if (!this.user) {
            window.location.href = 'index.html';
            return;
        }

        this.currentAssetType = 'stocks';
        this.currentSymbol = 'RELIANCE';
        this.marketData = null;
        this.chart = null;
        this.refreshInterval = null;

        this.init();
    }

    async init() {
        this.updateUserUI();
        await this.refreshMarketData();
        this.setupEventListeners();
        this.initChart();

        // Auto-refresh every 30 seconds
        this.refreshInterval = setInterval(() => this.refreshMarketData(), 30000);
    }

    updateUserUI() {
        document.getElementById('user-email').textContent = this.user.email;
        document.getElementById('nav-balance').textContent = this.formatCurrency(this.user.balance);
        document.getElementById('available-balance').textContent = this.formatCurrency(this.user.balance);
    }

    async refreshMarketData() {
        try {
            const response = await fetch('http://localhost:3000/api/market-data');
            this.marketData = await response.json();
            this.updateWatchlist();
            this.updateTicker();
            this.updateCurrentPrice();
            this.updateLastUpdated();
            console.log('✅ Market data refreshed:', new Date().toLocaleTimeString());
        } catch (error) {
            console.error('Failed to fetch market data:', error);
            this.showNotification('Failed to fetch market data', 'error');
        }
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
            this.updateChart(); // Update chart when symbol changes
        });

        // Quantity input
        document.getElementById('quantity').addEventListener('input', () => {
            this.updateTotalAmount();
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
        }
    }

    selectSymbol(symbol) {
        this.currentSymbol = symbol;
        document.getElementById('symbol-select').value = symbol;
        this.updateCurrentPrice();
        this.updateChart(); // Update chart when symbol changes
    }

    updateTotalAmount() {
        const quantity = parseFloat(document.getElementById('quantity').value) || 0;
        const price = parseFloat(document.getElementById('price').value) || 0;
        const total = quantity * price;
        const commission = total * 0.0005; // 0.05% commission

        document.getElementById('total-amount').textContent = this.formatCurrency(total);
        document.getElementById('commission').textContent = this.formatCurrency(commission);
    }

    async placeOrder(type) {
        const quantity = parseFloat(document.getElementById('quantity').value);
        const symbol = this.currentSymbol;
        const assetType = this.currentAssetType;

        if (!quantity || quantity <= 0) {
            this.showNotification('Please enter a valid quantity', 'error');
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/trade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.user.email,
                    symbol,
                    type,
                    quantity,
                    assetType
                })
            });

            const data = await response.json();

            if (data.success) {
                this.user.balance = data.newBalance;
                this.user.portfolio = data.portfolio;
                localStorage.setItem('user', JSON.stringify(this.user));
                this.updateUserUI();
                this.updatePortfolio();

                this.showNotification(
                    `${type.toUpperCase()} order executed: ${quantity} ${symbol} @ ₹${this.formatNumber(parseFloat(document.getElementById('price').value))}`,
                    'success'
                );

                document.getElementById('quantity').value = 1;
                this.updateTotalAmount();
            } else {
                this.showNotification(data.message, 'error');
            }
        } catch (error) {
            this.showNotification('Trade execution failed', 'error');
        }
    }

    async updatePortfolio() {
        try {
            const response = await fetch(`http://localhost:3000/api/portfolio/${this.user.email}`);
            const data = await response.json();

            if (data.success) {
                const container = document.getElementById('portfolio-content');
                container.innerHTML = '';

                const portfolio = data.portfolio;
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
        } catch (error) {
            console.error('Failed to fetch portfolio:', error);
        }
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
        this.chart.data.datasets[0].borderColor = trend ? '#00b15d' : '#ff5b5a';
        this.chart.data.datasets[0].backgroundColor = trend ? 'rgba(0, 177, 93, 0.1)' : 'rgba(255, 91, 90, 0.1)';

        this.chart.update('none'); // Update without animation
    }

    initChart() {
        const ctx = document.getElementById('tradingChart').getContext('2d');

        // Get initial price if available
        let initialPrice = 18000;
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
                    borderColor: '#00b15d',
                    backgroundColor: 'rgba(0, 177, 93, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5
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
                        backgroundColor: 'rgba(30, 34, 45, 0.9)',
                        titleColor: '#b7bdc6',
                        bodyColor: '#ffffff',
                        borderColor: '#36404a',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#2a2e39', drawBorder: false },
                        ticks: { color: '#b7bdc6', maxTicksLimit: 10 }
                    },
                    y: {
                        grid: { color: '#2a2e39', drawBorder: false },
                        ticks: { color: '#b7bdc6' }
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

    generateChartData(symbol = 'DEFAULT', currentPrice = 18000) {
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
        let basePrice = currentPrice * 0.85; // Start 15% below current price
        const volatility = currentPrice * 0.02; // 2% volatility
        const trend = (currentPrice - basePrice) / 50; // Upward trend to reach current price

        for (let i = 0; i < 50; i++) {
            labels.push(`${i}`);

            // Add trend + random walk
            const randomChange = (seededRandom(i) - 0.5) * volatility;
            basePrice += trend + randomChange;

            prices.push(Math.max(basePrice, currentPrice * 0.5)); // Don't go below 50% of current
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

async function processPayment() {
    const amount = parseInt(document.getElementById('custom-amount').value) || 0;

    if (amount <= 0) {
        platform.showNotification('Please enter a valid amount', 'error');
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: platform.user.email, amount })
        });

        const data = await response.json();

        if (data.success) {
            platform.user.balance = data.newBalance;
            localStorage.setItem('user', JSON.stringify(platform.user));
            platform.updateUserUI();
            hidePaymentModal();
            platform.showNotification(`₹${amount.toLocaleString()} added successfully!`, 'success');
        } else {
            platform.showNotification('Payment failed', 'error');
        }
    } catch (error) {
        platform.showNotification('Connection error', 'error');
    }
}

function logout() {
    if (platform.refreshInterval) {
        clearInterval(platform.refreshInterval);
    }
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// Add notification styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        top: 80px;
        right: 20px;
        background: var(--bg-secondary);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        border-left: 4px solid var(--accent-green);
        z-index: 3000;
        animation: slideIn 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 350px;
    }
    
    .notification.error {
        border-left-color: var(--accent-red);
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
