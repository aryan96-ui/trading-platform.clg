// professionalDashboard.js - Enterprise-Grade UI/UX Widgets and Features

// Theme Manager (Dark / Light Theme Switcher)
class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'dark';
        this.applyTheme(this.currentTheme);
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', this.currentTheme);
        this.applyTheme(this.currentTheme);
        return this.currentTheme;
    }

    applyTheme(theme) {
        document.body.className = theme + '-theme';
        if (theme === 'light') {
            document.documentElement.style.setProperty('--bg-dark', '#f0f2f5');
            document.documentElement.style.setProperty('--bg-panel', '#ffffff');
            document.documentElement.style.setProperty('--bg-card', '#f8f9fa');
            document.documentElement.style.setProperty('--border-color', '#dee2e6');
            document.documentElement.style.setProperty('--text-primary', '#1e293b');
            document.documentElement.style.setProperty('--text-secondary', '#64748b');
            document.documentElement.style.setProperty('--hover-bg', '#e2e8f0');
        } else {
            document.documentElement.style.setProperty('--bg-dark', '#0a0e27');
            document.documentElement.style.setProperty('--bg-panel', '#141930');
            document.documentElement.style.setProperty('--bg-card', '#1a1f3a');
            document.documentElement.style.setProperty('--border-color', '#2a2f4a');
            document.documentElement.style.setProperty('--text-primary', '#ffffff');
            document.documentElement.style.setProperty('--text-secondary', '#8b92b5');
            document.documentElement.style.setProperty('--hover-bg', '#252a45');
        }
        console.log(`ThemeManager: Applied ${theme} theme`);
    }
}

// Keyboard Shortcuts system
class KeyboardShortcuts {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('keydown', (e) => {
            // Check if user is typing in input fields
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
                return;
            }

            // Alt+C - Clear drawings
            if (e.altKey && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                if (window.proTrader && window.proTrader.chartEngine) {
                    window.proTrader.chartEngine.clearDrawings();
                    window.proTrader.showNotification('Drawings cleared', 'info');
                }
            }

            // Alt+F - Fullscreen chart
            if (e.altKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                const container = document.getElementById('multiChartContainer');
                if (container) {
                    if (!document.fullscreenElement) {
                        container.requestFullscreen().catch(err => console.error(err));
                    } else {
                        document.exitFullscreen();
                    }
                }
            }

            // Alt+B - Focus buy amount/Trigger Buy dialog
            if (e.altKey && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                const btn = document.querySelector('.btn-buy');
                if (btn) {
                    btn.click();
                    window.proTrader.showNotification('BUY shortcut triggered', 'success');
                }
            }

            // Alt+S - Focus sell amount/Trigger Sell dialog
            if (e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                const btn = document.querySelector('.btn-sell');
                if (btn) {
                    btn.click();
                    window.proTrader.showNotification('SELL shortcut triggered', 'error');
                }
            }

            // Alt+T - Toggle layout theme
            if (e.altKey && e.key.toLowerCase() === 't') {
                e.preventDefault();
                this.dashboard.themes.toggleTheme();
                window.proTrader.showNotification('Theme toggled', 'info');
            }
        });
    }
}

// Economic Calendar Widget Renderer
class EconomicCalendarWidget {
    render(container) {
        const events = [
            { time: '18:00', event: 'US Initial Jobless Claims', impact: 'Medium', forecast: '220K', actual: '215K' },
            { time: '20:00', event: 'FOMC Interest Rate Decision', impact: 'High', forecast: '5.25%', actual: '5.25%' },
            { time: 'Tomorrow', event: 'Non-Farm Employment Change', impact: 'High', forecast: '180K', actual: '-' },
            { time: 'Jun 28', event: 'US Core PCE Price Index MoM', impact: 'High', forecast: '0.1%', actual: '-' },
            { time: 'Jun 30', event: 'EU CPI Inflation Rate YoY', impact: 'Medium', forecast: '2.5%', actual: '-' }
        ];

        container.innerHTML = `
            <div class="calendar-list" style="display: flex; flex-direction: column; gap: 8px;">
                ${events.map(ev => {
                    const impactClass = ev.impact === 'High' ? 'accent-red' : 'accent-orange';
                    const colorVal = ev.impact === 'High' ? 'var(--accent-red)' : '#ffb74d';
                    return `
                        <div class="calendar-item" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--border-color); font-size: 12px;">
                            <div style="flex: 1;">
                                <span style="color: var(--text-secondary); font-size: 11px; margin-right: 6px;">${ev.time}</span>
                                <span style="font-weight: 500;">${ev.event}</span>
                            </div>
                            <div style="display: flex; gap: 8px; font-family: monospace; font-size: 11px;">
                                <span style="color: ${colorVal}; font-weight: 700;">${ev.impact.toUpperCase()}</span>
                                <span style="color: var(--text-secondary);">F: ${ev.forecast}</span>
                                <span style="color: var(--text-primary); font-weight: 600;">A: ${ev.actual}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
}

// Portfolio Analytics Widget Renderer
class PortfolioAnalyticsWidget {
    render(container, userPortfolio) {
        if (!userPortfolio || Object.keys(userPortfolio).length === 0) {
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px;">
                    Portfolio is currently empty.
                </div>
            `;
            return;
        }

        const holdings = Object.entries(userPortfolio);
        const totalItems = holdings.length;

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; height: 100%; justify-content: center;">
                <h4 style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; font-weight: 600; text-transform: uppercase;">Asset Allocation</h4>
                <div class="asset-bars" style="display: flex; flex-direction: column; gap: 10px;">
                    ${holdings.map(([sym, hold]) => {
                        const amount = hold.amount || 0;
                        const avgPrice = hold.avgPrice || 1;
                        const value = amount * avgPrice;
                        // Draw simulated progress bar
                        return `
                            <div style="font-size: 12px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                    <span style="font-weight: 600; color: var(--text-primary);">${sym}</span>
                                    <span style="color: var(--text-secondary);">${amount.toFixed(4)} @ ₹${avgPrice.toFixed(2)}</span>
                                </div>
                                <div style="width: 100%; height: 6px; background: var(--border-color); border-radius: 3px; position: relative; overflow: hidden;">
                                    <div style="width: ${Math.min(100, (amount * 10))}%; height: 100%; background: var(--accent-blue); border-radius: 3px;"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
}

// Risk Management Widget
class RiskManagementWidget {
    constructor() {
        this.accountSize = 100000;
        this.riskPercent = 1; // 1%
        this.entryPrice = 48000;
        this.stopLoss = 47500;
    }

    render(container) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 10px; font-size: 12px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div>
                        <label style="color: var(--text-secondary); margin-bottom: 4px; display: block;">Account Balance (₹)</label>
                        <input type="number" id="risk-acc-size" class="input-field" value="${this.accountSize}" style="width: 100%; padding: 4px 8px; font-size: 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                    </div>
                    <div>
                        <label style="color: var(--text-secondary); margin-bottom: 4px; display: block;">Risk Limit (%)</label>
                        <input type="number" id="risk-pct" class="input-field" value="${this.riskPercent}" step="0.1" style="width: 100%; padding: 4px 8px; font-size: 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div>
                        <label style="color: var(--text-secondary); margin-bottom: 4px; display: block;">Entry Price (₹)</label>
                        <input type="number" id="risk-entry" class="input-field" value="${this.entryPrice}" style="width: 100%; padding: 4px 8px; font-size: 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                    </div>
                    <div>
                        <label style="color: var(--text-secondary); margin-bottom: 4px; display: block;">Stop Loss (₹)</label>
                        <input type="number" id="risk-stop" class="input-field" value="${this.stopLoss}" style="width: 100%; padding: 4px 8px; font-size: 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                    </div>
                </div>
                
                <div id="risk-calc-output" style="background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 4px; padding: 10px; display: flex; flex-direction: column; gap: 6px; font-family: monospace;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Cash Risk:</span>
                        <span style="color: var(--accent-red); font-weight: 700;" id="risk-cash-val">₹1,000.00</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Position Size:</span>
                        <span style="color: var(--accent-green); font-weight: 700;" id="risk-position-val">2.0000 Units</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Leverage Required:</span>
                        <span style="color: var(--text-primary);" id="risk-leverage-val">0.96x</span>
                    </div>
                </div>
            </div>
        `;

        // Bind calculation listener inputs
        const calculate = () => {
            const acc = parseFloat(document.getElementById('risk-acc-size').value) || 0;
            const pct = parseFloat(document.getElementById('risk-pct').value) || 0;
            const ent = parseFloat(document.getElementById('risk-entry').value) || 0;
            const stop = parseFloat(document.getElementById('risk-stop').value) || 0;

            const cashRisk = acc * (pct / 100);
            const priceDiff = Math.abs(ent - stop);
            
            let posSize = 0;
            if (priceDiff > 0) {
                posSize = cashRisk / priceDiff;
            }

            const totalValue = posSize * ent;
            const leverage = acc > 0 ? (totalValue / acc) : 0;

            document.getElementById('risk-cash-val').textContent = `₹${cashRisk.toFixed(2)}`;
            document.getElementById('risk-position-val').textContent = `${posSize.toFixed(4)} Units`;
            document.getElementById('risk-leverage-val').textContent = `${leverage.toFixed(2)}x`;
        };

        const inputs = ['risk-acc-size', 'risk-pct', 'risk-entry', 'risk-stop'];
        inputs.forEach(id => {
            document.getElementById(id).addEventListener('input', calculate);
        });

        calculate();
    }
}

// AI Trading Signals Widget
class TradingSignalsWidget {
    render(container, currentSymbol) {
        const signals = {
            'BTC': { action: 'Strong Buy', confidence: '94%', reason: 'RSI oversold on 4H (32), MACD Bullish crossover confirmed at 47,800. Strong volume support.', support: '₹47,200', resistance: '₹49,800' },
            'ETH': { action: 'Buy', confidence: '82%', reason: 'EMA 20/50 Golden Cross forming on 1D timeframe. Bollinger bands squeezing indicating high volatility ahead.', support: '₹3,180', resistance: '₹3,350' },
            'TCS': { action: 'Hold', confidence: '55%', reason: 'Price consolidating near moving average bounds. Relative strength index neutral (50). Wait for breakout.', support: '₹3,200', resistance: '₹3,320' },
            'RELIANCE': { action: 'Sell', confidence: '71%', reason: 'RSI overbought (78). Failed to break upper resistance boundary. Stochastics crossing down.', support: '₹2,400', resistance: '₹2,510' }
        };

        const signal = signals[currentSymbol] || { action: 'Neutral', confidence: '50%', reason: 'Consolidating price action. Neutral RSI and MACD trends. No clear momentum signal.', support: 'Support: N/A', resistance: 'Resistance: N/A' };
        
        let colorClass = 'var(--text-secondary)';
        if (signal.action.includes('Buy')) colorClass = 'var(--accent-green)';
        else if (signal.action.includes('Sell')) colorClass = 'var(--accent-red)';

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px; height: 100%; justify-content: center;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; color: var(--text-primary); text-transform: uppercase;">Signal (${currentSymbol})</span>
                    <span style="font-weight: 800; color: ${colorClass}; font-size: 13px; text-transform: uppercase;">${signal.action} (${signal.confidence})</span>
                </div>
                <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4; background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 8px; border-radius: 4px;">
                    ${signal.reason}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-family: monospace; font-size: 11px;">
                    <div style="background: rgba(38,166,154,0.06); padding: 4px; border-radius: 2px; text-align: center; border: 1px solid rgba(38,166,154,0.15);">
                        <span style="color: var(--accent-green);">Support:</span> ${signal.support}
                    </div>
                    <div style="background: rgba(239,83,80,0.06); padding: 4px; border-radius: 2px; text-align: center; border: 1px solid rgba(239,83,80,0.15);">
                        <span style="color: var(--accent-red);">Resistance:</span> ${signal.resistance}
                    </div>
                </div>
            </div>
        `;
    }
}

// Market Overview Indices status
class MarketOverviewWidget {
    render(container) {
        const indices = [
            { name: 'S&P 500', value: '5,424.30', change: 0.85 },
            { name: 'NASDAQ 100', value: '19,410.80', change: 1.25 },
            { name: 'Dow Jones', value: '39,120.40', change: -0.24 },
            { name: 'NIFTY 50', value: '23,540.10', change: 0.45 }
        ];

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; height: 100%; align-content: center;">
                ${indices.map(idx => {
                    const pctClass = idx.change >= 0 ? 'positive' : 'negative';
                    const colorVal = idx.change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                    const arrow = idx.change >= 0 ? '▲' : '▼';
                    return `
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 2px;">
                            <span style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">${idx.name}</span>
                            <span style="font-weight: 700; font-family: monospace;">${idx.value}</span>
                            <span style="color: ${colorVal}; font-size: 11px; font-weight: 600;">${arrow} ${Math.abs(idx.change).toFixed(2)}%</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
}

// Main Enterprise Dashboard class
class EnterpriseDashboard {
    constructor() {
        this.widgets = new Map();
        this.themes = new ThemeManager();
        this.shortcuts = new KeyboardShortcuts(this);
        this.broadcastChannel = null;
        this.currentLayout = 'classic'; // 'classic' or 'enterprise'
        this.proTrader = null;

        // Initialize Broadcast Channel for multi-monitor tab syncing
        this.initBroadcastChannel();
    }

    initialize(proTrader) {
        this.proTrader = proTrader;
        console.log('EnterpriseDashboard: Widget system initialized.');
    }

    initBroadcastChannel() {
        try {
            this.broadcastChannel = new BroadcastChannel('protrader-channel');
            this.broadcastChannel.onmessage = (event) => {
                const { type, data } = event.data;
                console.log(`EnterpriseDashboard: Broadcast Received -> ${type}`, data);

                if (type === 'symbol-select') {
                    if (this.proTrader && (this.proTrader.selectedSymbol !== data.symbol || this.proTrader.selectedAssetType !== data.type)) {
                        this.proTrader.selectedSymbol = data.symbol;
                        this.proTrader.selectedAssetType = data.type;
                        
                        // Execute selection sync in UI
                        this.proTrader.selectWatchlistItem(data.symbol, data.type);
                        this.proTrader.showNotification(`Synced Symbol: ${data.symbol}`, 'info');
                    }
                } else if (type === 'portfolio-update') {
                    if (this.proTrader) {
                        this.proTrader.user.balance = data.balance;
                        this.proTrader.user.portfolio = data.portfolio || {};
                        this.proTrader.updateUI();
                        this.proTrader.displayPortfolio();
                        this.refreshWidgets();
                    }
                }
            };
        } catch (e) {
            console.error('Failed to initialize BroadcastChannel:', e);
        }
    }

    // Broadcast select symbol changes across tabs
    broadcastSymbolChange(symbol, type) {
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({
                type: 'symbol-select',
                data: { symbol, type }
            });
        }
    }

    // Broadcast balance & portfolio updates across tabs
    broadcastPortfolioUpdate(balance, portfolio) {
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({
                type: 'portfolio-update',
                data: { balance, portfolio }
            });
        }
    }

    // Export Trade History logs to CSV
    exportHistoryToCSV(tradeHistory) {
        if (!tradeHistory || tradeHistory.length === 0) {
            alert('No trade history available to export.');
            return;
        }

        const headers = ['Type', 'Symbol', 'Price', 'Timestamp'];
        const csvRows = [headers.join(',')];

        tradeHistory.forEach(trade => {
            const timestamp = trade.timestamp || new Date().toISOString();
            const row = [
                trade.type.toUpperCase(),
                trade.symbol,
                trade.price || trade.totalAmount,
                `"${timestamp}"`
            ];
            csvRows.push(row.join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `protrader_trade_history_${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    renderEnterpriseGrid() {
        const grid = document.getElementById('enterprise-grid-container');
        if (!grid) return;

        grid.innerHTML = `
            <div class="enterprise-widget-card" id="widget-market-overview">
                <div class="widget-header"><span>Market Status</span><span class="widget-pin">📍</span></div>
                <div class="widget-body" id="widget-body-market-overview"></div>
            </div>
            <div class="enterprise-widget-card" id="widget-signals">
                <div class="widget-header"><span>Technical Analysis</span><span class="widget-pin">📍</span></div>
                <div class="widget-body" id="widget-body-signals"></div>
            </div>
            <div class="enterprise-widget-card" id="widget-risk">
                <div class="widget-header"><span>Position Sizing Calculator</span><span class="widget-pin">📍</span></div>
                <div class="widget-body" id="widget-body-risk"></div>
            </div>
            <div class="enterprise-widget-card" id="widget-portfolio">
                <div class="widget-header"><span>Asset Allocations</span><span class="widget-pin">📍</span></div>
                <div class="widget-body" id="widget-body-portfolio"></div>
            </div>
            <div class="enterprise-widget-card" id="widget-calendar">
                <div class="widget-header"><span>Macro Calendar</span><span class="widget-pin">📍</span></div>
                <div class="widget-body" id="widget-body-calendar"></div>
            </div>
        `;

        this.refreshWidgets();
    }

    refreshWidgets() {
        if (this.currentLayout !== 'enterprise' || !this.proTrader) return;

        const overview = new MarketOverviewWidget();
        const signals = new TradingSignalsWidget();
        const risk = new RiskManagementWidget();
        const portfolio = new PortfolioAnalyticsWidget();
        const calendar = new EconomicCalendarWidget();

        // Render widgets into their bodies
        const overviewBody = document.getElementById('widget-body-market-overview');
        const signalsBody = document.getElementById('widget-body-signals');
        const riskBody = document.getElementById('widget-body-risk');
        const portfolioBody = document.getElementById('widget-body-portfolio');
        const calendarBody = document.getElementById('widget-body-calendar');

        if (overviewBody) overview.render(overviewBody);
        if (signalsBody) signals.render(signalsBody, this.proTrader.selectedSymbol);
        if (riskBody) {
            risk.entryPrice = this.proTrader.marketData[this.proTrader.selectedAssetType]?.[this.proTrader.selectedSymbol]?.price || 100;
            risk.stopLoss = risk.entryPrice * 0.98; // Default 2% stop
            risk.accountSize = this.proTrader.user.balance;
            risk.render(riskBody);
        }
        if (portfolioBody) portfolio.render(portfolioBody, this.proTrader.user.portfolio);
        if (calendarBody) calendar.render(calendarBody);
    }
}
