/**
 * ProTrader Intelligence Hub - Interactive Quant, Risk, Regime & Monte Carlo Engine
 */

class IntelligenceHub {
    constructor() {
        this.activeTab = 'heatmap';
        this.init();
    }

    init() {
        this.attachModalEvents();
    }

    openModal(defaultTab = 'heatmap') {
        const modal = document.getElementById('intel-modal-overlay');
        if (modal) {
            modal.style.display = 'flex';
            this.switchTab(defaultTab);
        }
    }

    closeModal() {
        const modal = document.getElementById('intel-modal-overlay');
        if (modal) modal.style.display = 'none';
    }

    attachModalEvents() {
        // Tab switching
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.intel-tab-btn');
            if (btn && btn.dataset.tab) {
                this.switchTab(btn.dataset.tab);
            }
        });
    }

    switchTab(tabName) {
        this.activeTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.intel-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab panes
        document.querySelectorAll('.intel-tab-pane').forEach(pane => {
            pane.style.display = pane.id === `intel-pane-${tabName}` ? 'block' : 'none';
        });

        // Load content for active tab
        if (tabName === 'heatmap') this.loadHeatmap();
        if (tabName === 'regime') this.loadRegime();
        if (tabName === 'montecarlo') this.loadMonteCarlo();
        if (tabName === 'anomaly') this.loadAnomaly();
        if (tabName === 'tape') this.loadTape();
    }

    async loadHeatmap() {
        const container = document.getElementById('intel-heatmap-container');
        if (!container) return;

        container.innerHTML = '<div class="intel-loading">🔄 Calculating K-Means Sector & Volatility Clusters...</div>';
        try {
            const res = await fetch('/api/heatmap');
            const data = await res.json();

            if (data.clusters && Array.isArray(data.clusters)) {
                let html = '<div class="intel-clusters-grid">';
                data.clusters.forEach(cluster => {
                    html += `
                        <div class="intel-cluster-card" style="border-top: 3px solid ${cluster.color}">
                            <div class="cluster-card-head">
                                <h4>${cluster.label}</h4>
                                <span class="cluster-regime-badge" style="background:${cluster.color}20; color:${cluster.color}">${cluster.regime}</span>
                            </div>
                            <div class="cluster-assets-list">
                                ${cluster.members.map(m => `
                                    <div class="cluster-asset-row" onclick="window.tradingApp && window.tradingApp.selectSymbol('${m.symbol}')">
                                        <span class="asset-sym">${m.symbol}</span>
                                        <span class="asset-price">₹${m.price.toFixed(2)}</span>
                                        <span class="asset-chg ${m.changePercent >= 0 ? 'pos' : 'neg'}">${m.changePercent >= 0 ? '+' : ''}${m.changePercent}%</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
                container.innerHTML = html;
            } else {
                container.innerHTML = '<div class="intel-empty">No cluster data available</div>';
            }
        } catch (e) {
            container.innerHTML = `<div class="intel-error">Failed to load heatmap: ${e.message}</div>`;
        }
    }

    async loadRegime() {
        const container = document.getElementById('intel-regime-container');
        if (!container) return;

        const sym = (window.tradingApp && window.tradingApp.currentSymbol) || 'RELIANCE';
        container.innerHTML = `<div class="intel-loading">🔄 Computing Multi-Timeframe Signals & Regime for ${sym}...</div>`;

        try {
            const res = await fetch(`/api/indicators?symbol=${sym}`);
            const data = await res.json();

            if (data.success && data.indicators) {
                const ind = data.indicators;
                const sig = data.signals;

                container.innerHTML = `
                    <div class="intel-regime-dashboard">
                        <div class="regime-banner" style="border-color:${sig.signal === 'BUY' ? '#10b981' : sig.signal === 'SELL' ? '#f43f5e' : '#3b82f6'}">
                            <div class="regime-main-info">
                                <span class="regime-subtext">Algorithmic Confluence Signal</span>
                                <h2>${sig.signal} <span class="conf-score">(${sig.confidence}% Algorithmic Confidence)</span></h2>
                            </div>
                            <button class="btn-ask-copilot" onclick="window.proTraderChat && window.proTraderChat.sendMessage('Explain the ${sig.signal} signal and technical confluence for ${sym}')">
                                🤖 Ask Copilot Why
                            </button>
                        </div>

                        <div class="indicators-grid-4">
                            <div class="ind-metric-card">
                                <span class="ind-label">RSI (14)</span>
                                <span class="ind-val ${ind.rsi.value > 70 ? 'neg' : ind.rsi.value < 30 ? 'pos' : ''}">${ind.rsi.value}</span>
                                <span class="ind-desc">${ind.rsi.signal}</span>
                            </div>
                            <div class="ind-metric-card">
                                <span class="ind-label">MACD Momentum</span>
                                <span class="ind-val ${ind.macd.histogram > 0 ? 'pos' : 'neg'}">${ind.macd.histogram}</span>
                                <span class="ind-desc">${ind.macd.trend} Trend</span>
                            </div>
                            <div class="ind-metric-card">
                                <span class="ind-label">Bollinger %B</span>
                                <span class="ind-val">${ind.bollingerBands.percentB}%</span>
                                <span class="ind-desc">Upper: ₹${ind.bollingerBands.upper}</span>
                            </div>
                            <div class="ind-metric-card">
                                <span class="ind-label">14-Period ATR</span>
                                <span class="ind-val">₹${ind.atr.value}</span>
                                <span class="ind-desc">Volatility: ${ind.atr.percentOfPrice}</span>
                            </div>
                        </div>

                        <div class="fib-levels-card">
                            <h4>📐 Automated Fibonacci Retracement Levels</h4>
                            <div class="fib-levels-row">
                                <span class="fib-tag">0% (High): ₹${ind.fibonacci.level_0}</span>
                                <span class="fib-tag">23.6%: ₹${ind.fibonacci.level_236}</span>
                                <span class="fib-tag">38.2%: ₹${ind.fibonacci.level_382}</span>
                                <span class="fib-tag">50.0% (Equilibrium): ₹${ind.fibonacci.level_500}</span>
                                <span class="fib-tag">61.8% (Golden): ₹${ind.fibonacci.level_618}</span>
                                <span class="fib-tag">100% (Low): ₹${ind.fibonacci.level_100}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        } catch (e) {
            container.innerHTML = `<div class="intel-error">Failed to calculate indicators: ${e.message}</div>`;
        }
    }

    async loadMonteCarlo() {
        const container = document.getElementById('intel-montecarlo-container');
        if (!container) return;

        container.innerHTML = `
            <div class="monte-carlo-builder">
                <div class="mc-inputs-row">
                    <div class="mc-input-group">
                        <label>Account Capital (₹)</label>
                        <input type="number" id="mc-capital" value="100000" step="10000">
                    </div>
                    <div class="mc-input-group">
                        <label>Strategy Win Rate (0 - 1)</label>
                        <input type="number" id="mc-winrate" value="0.55" step="0.01" min="0.1" max="0.9">
                    </div>
                    <div class="mc-input-group">
                        <label>Avg Win %</label>
                        <input type="number" id="mc-avgwin" value="3.5" step="0.5">
                    </div>
                    <div class="mc-input-group">
                        <label>Avg Loss %</label>
                        <input type="number" id="mc-avgloss" value="2.0" step="0.5">
                    </div>
                    <div class="mc-input-group">
                        <label>Risk Per Trade %</label>
                        <input type="number" id="mc-risk" value="2" step="0.5">
                    </div>
                    <button class="btn-run-sim" onclick="window.intelligenceHub.runMonteCarloSim()">🎲 Run 10,000 Simulations</button>
                </div>
                <div id="mc-results-area" class="mc-results-area">
                    <div class="intel-loading">Click "Run 10,000 Simulations" to compute probabilistic equity distribution.</div>
                </div>
            </div>
        `;
        this.runMonteCarloSim();
    }

    async runMonteCarloSim() {
        const resultsArea = document.getElementById('mc-results-area');
        if (!resultsArea) return;

        resultsArea.innerHTML = '<div class="intel-loading">🎲 Simulating 10,000 strategy equity paths...</div>';

        const capital = parseFloat(document.getElementById('mc-capital')?.value) || 100000;
        const winRate = parseFloat(document.getElementById('mc-winrate')?.value) || 0.55;
        const avgWinPercent = parseFloat(document.getElementById('mc-avgwin')?.value) || 3.5;
        const avgLossPercent = parseFloat(document.getElementById('mc-avgloss')?.value) || 2.0;
        const riskPerTrade = (parseFloat(document.getElementById('mc-risk')?.value) || 2) / 100;

        try {
            const res = await fetch('/api/monte-carlo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initialCapital: capital,
                    numTrades: 100,
                    numSimulations: 10000,
                    winRate,
                    avgWinPercent,
                    avgLossPercent,
                    riskPerTrade
                })
            });

            const data = await res.json();
            if (data.success) {
                resultsArea.innerHTML = `
                    <div class="mc-stats-grid">
                        <div class="mc-stat-box">
                            <span class="stat-lbl">Probability of Profit</span>
                            <span class="stat-num pos">${data.probOfProfit}%</span>
                        </div>
                        <div class="mc-stat-box">
                            <span class="stat-lbl">Median Final Equity</span>
                            <span class="stat-num">₹${Math.round(data.percentiles.medianEquity).toLocaleString()}</span>
                        </div>
                        <div class="mc-stat-box">
                            <span class="stat-lbl">95% Confidence Floor</span>
                            <span class="stat-num">₹${Math.round(data.percentiles.p5Equity).toLocaleString()}</span>
                        </div>
                        <div class="mc-stat-box">
                            <span class="stat-lbl">95% Worst Drawdown</span>
                            <span class="stat-num neg">${data.percentiles.p95Drawdown.toFixed(1)}%</span>
                        </div>
                        <div class="mc-stat-box">
                            <span class="stat-lbl">Probability of Ruin (&gt;35% DD)</span>
                            <span class="stat-num ${data.probOfRuin > 5 ? 'neg' : 'pos'}">${data.probOfRuin}%</span>
                        </div>
                    </div>

                    <div class="mc-histogram-card">
                        <h4>📊 10,000-Trial Strategy Outcome Distribution</h4>
                        <div class="mc-histogram-bars">
                            ${data.histogram.map(bin => `
                                <div class="histogram-col" title="₹${Math.round(bin.minEquity).toLocaleString()} - ₹${Math.round(bin.maxEquity).toLocaleString()} (${bin.count} runs)">
                                    <div class="histogram-fill ${bin.minEquity >= capital ? 'pos' : 'neg'}" style="height:${Math.max(6, (bin.count / 3000) * 100)}%"></div>
                                    <span class="histogram-lbl">₹${Math.round(bin.minEquity / 1000)}k</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        } catch (e) {
            resultsArea.innerHTML = `<div class="intel-error">Simulation failed: ${e.message}</div>`;
        }
    }

    async loadAnomaly() {
        const container = document.getElementById('intel-anomaly-container');
        if (!container) return;

        const sym = (window.tradingApp && window.tradingApp.currentSymbol) || 'RELIANCE';
        container.innerHTML = `<div class="intel-loading">🔍 Scanning ${sym} for statistical deviations and flash spikes...</div>`;

        try {
            const res = await fetch(`/api/anomaly?symbol=${sym}`);
            const data = await res.json();

            if (data.success && data.scan) {
                const s = data.scan;
                container.innerHTML = `
                    <div class="anomaly-dashboard">
                        <div class="anomaly-status-banner ${s.isAnomaly ? 'alert' : 'safe'}">
                            <div class="status-icon">${s.isAnomaly ? '⚠️' : '✅'}</div>
                            <div>
                                <h3>${s.isAnomaly ? 'STATISTICAL ANOMALY DETECTED' : 'NORMAL MARKET EQUILIBRIUM'}</h3>
                                <p>Anomaly Stress Score: <strong>${s.anomalyScore} / 100</strong> • Return Z-Score: <strong>${s.returnZScore}σ</strong> • Volume Z-Score: <strong>${s.volumeZScore}σ</strong></p>
                            </div>
                        </div>

                        <div class="alerts-list">
                            <h4>Active Anomaly Alerts (${s.alerts.length})</h4>
                            ${s.alerts.length === 0 ? '<div class="no-alerts">No volume surges or flash crashes detected. Market is operating within standard deviation bands.</div>' : ''}
                            ${s.alerts.map(a => `
                                <div class="anomaly-alert-item ${a.severity.toLowerCase()}">
                                    <span class="alert-type">${a.type}</span>
                                    <span class="alert-msg">${a.message}</span>
                                    <span class="alert-metric">${a.metric}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        } catch (e) {
            container.innerHTML = `<div class="intel-error">Anomaly scan failed: ${e.message}</div>`;
        }
    }

    async loadTape() {
        const container = document.getElementById('intel-tape-container');
        if (!container) return;

        const sym = (window.tradingApp && window.tradingApp.currentSymbol) || 'RELIANCE';
        const price = (window.tradingApp && window.tradingApp.getCurrentPrice()) || 2450.00;

        // Generate high-frequency synthetic time & sales tape
        const rows = [];
        const now = Date.now();
        for (let i = 0; i < 25; i++) {
            const time = new Date(now - (i * 1200)).toLocaleTimeString();
            const isBuy = Math.random() > 0.48;
            const delta = (Math.random() - 0.5) * (price * 0.002);
            const tradePrice = Number((price + delta).toFixed(2));
            const qty = Math.floor(10 + Math.random() * 500);
            const isBlock = qty >= 350;

            rows.push(`
                <div class="tape-row ${isBuy ? 'buy' : 'sell'} ${isBlock ? 'whale-block' : ''}">
                    <span class="tape-time">${time}</span>
                    <span class="tape-sym">${sym}</span>
                    <span class="tape-side">${isBuy ? 'BUY' : 'SELL'}</span>
                    <span class="tape-price">₹${tradePrice.toFixed(2)}</span>
                    <span class="tape-qty">${qty} units ${isBlock ? '🐋 <strong>WHALE</strong>' : ''}</span>
                </div>
            `);
        }

        container.innerHTML = `
            <div class="tape-container">
                <div class="tape-header">
                    <span>Time</span>
                    <span>Symbol</span>
                    <span>Side</span>
                    <span>Execution Price</span>
                    <span>Size / Flags</span>
                </div>
                <div class="tape-body">
                    ${rows.join('')}
                </div>
            </div>
        `;
    }
}

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { window.intelligenceHub = new IntelligenceHub(); });
} else {
    window.intelligenceHub = new IntelligenceHub();
}
