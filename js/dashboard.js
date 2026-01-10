// Initialize user data
const user = JSON.parse(localStorage.getItem('user'));
if (!user) {
    window.location.href = 'index.html';
}

document.getElementById('user-email').textContent = user.email;
document.getElementById('balance').textContent = `₹${user.balance.toLocaleString()}`;

// -------------------------------------------------
// CONFIGURATION
// -------------------------------------------------
const ALPHA_VANTAGE_API_KEY = 'YOUR_API_KEY_HERE'; // <-- replace with your free API key
const DEFAULT_SYMBOL = 'NIFTY'; // fallback symbol for demo

// -------------------------------------------------
// FETCH REAL OHLC DATA FROM Alpha Vantage
// -------------------------------------------------
async function fetchChartData(symbol) {
    try {
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        const timeSeries = data['Time Series (Daily)'];
        if (!timeSeries) {
            console.warn('Alpha Vantage returned no data, falling back to static sample');
            return null;
        }
        // Convert to array sorted by date ascending
        const entries = Object.entries(timeSeries)
            .map(([date, values]) => ({
                time: date,
                open: parseFloat(values['1. open']),
                high: parseFloat(values['2. high']),
                low: parseFloat(values['3. low']),
                close: parseFloat(values['4. close'])
            }))
            .sort((a, b) => new Date(a.time) - new Date(b.time));
        return entries;
    } catch (e) {
        console.error('Error fetching chart data:', e);
        return null;
    }
}

// -------------------------------------------------
// CREATE CHART (using LightweightCharts or Chart.js – we keep LightweightCharts for candlesticks)
// -------------------------------------------------
let chart, candlestickSeries, volumeSeries;
function initChart(ohlcData) {
    const chartContainer = document.getElementById('candlestick-chart');
    chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: chartContainer.clientHeight,
        layout: { background: { type: 'solid', color: '#1e222d' }, textColor: '#b7bdc6' },
        grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#2a2e39' },
        timeScale: { borderColor: '#2a2e39', timeVisible: true }
    });
    candlestickSeries = chart.addCandlestickSeries({
        upColor: '#00b15d', downColor: '#ff5b5a', borderDownColor: '#ff5b5a', borderUpColor: '#00b15d', wickDownColor: '#ff5b5a', wickUpColor: '#00b15d'
    });
    candlestickSeries.setData(ohlcData);
    // Volume series (optional)
    const volumeData = ohlcData.map(c => ({
        time: c.time,
        value: Math.random() * 1000000 + 500000,
        color: c.close > c.open ? 'rgba(0,177,93,0.3)' : 'rgba(255,91,90,0.3)'
    }));
    volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' }, priceScaleId: '', scaleMargins: { top: 0.8, bottom: 0 }
    });
    volumeSeries.setData(volumeData);
    chart.timeScale().fitContent();
    // Resize handling
    window.addEventListener('resize', () => {
        chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight });
    });
    // Update price display
    const last = ohlcData[ohlcData.length - 1];
    const first = ohlcData[0];
    const change = ((last.close - first.close) / first.close * 100).toFixed(2);
    document.getElementById('current-price').textContent = `₹${last.close.toFixed(2)}`;
    document.getElementById('price-change').textContent = `${change >= 0 ? '+' : ''}${change}%`;
    document.getElementById('price-change').style.color = change >= 0 ? '#00b15d' : '#ff5b5a';
}

// -------------------------------------------------
// LOAD INITIAL CHART
// -------------------------------------------------
(async () => {
    const data = await fetchChartData(DEFAULT_SYMBOL);
    if (data && data.length) {
        initChart(data);
    } else {
        // fallback to static sample if API fails
        const fallback = [
            { time: '2024-01-01', open: 100, high: 105, low: 98, close: 103 },
            { time: '2024-01-02', open: 103, high: 108, low: 102, close: 107 },
            // ... you can keep the rest of the static sample here if you wish
        ];
        initChart(fallback);
    }
})();

// -------------------------------------------------
// TRADING FUNCTIONS – now include selected stock symbol
// -------------------------------------------------
async function placeOrder(type) {
    const amountInput = document.getElementById(`${type}-amount`);
    const amount = parseInt(amountInput.value);
    const stock = document.getElementById('stock-select').value;
    const price = parseFloat(document.getElementById('price').value);
    if (!amount || amount <= 0) {
        alert('Please enter a valid amount');
        return;
    }
    try {
        const response = await fetch('http://localhost:3000/api/trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, type, amount, symbol: stock, price })
        });
        const data = await response.json();
        if (data.success) {
            user.balance = data.newBalance;
            localStorage.setItem('user', JSON.stringify(user));
            document.getElementById('balance').textContent = `₹${user.balance.toLocaleString()}`;
            amountInput.value = '';
            alert(`${type.toUpperCase()} order placed successfully!`);
        } else {
            alert('Trade failed: ' + data.message);
        }
    } catch (e) {
        alert('Connection error');
    }
}

// -------------------------------------------------
// PAYMENT FUNCTIONS (unchanged)
// -------------------------------------------------
function showPaymentModal() { document.getElementById('payment-modal').style.display = 'block'; }
function hidePaymentModal() { document.getElementById('payment-modal').style.display = 'none'; }
function processPayment() {
    const amount = parseInt(document.getElementById('custom-amount').value) || 0;
    if (amount <= 0) { alert('Enter a valid amount'); return; }
    fetch('http://localhost:3000/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, amount })
    })
        .then(r => r.json())
        .then(d => {
            if (d.success) {
                user.balance = d.newBalance;
                localStorage.setItem('user', JSON.stringify(user));
                document.getElementById('balance').textContent = `₹${user.balance.toLocaleString()}`;
                hidePaymentModal();
                alert('Payment successful!');
            } else { alert('Payment failed'); }
        })
        .catch(() => alert('Connection error'));
}

function logout() { localStorage.removeItem('user'); window.location.href = 'index.html'; }
