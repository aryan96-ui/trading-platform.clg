/**
 * ProTrader — chart/chart
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== SYMBOL SELECT ====================
function selectSymbol(symbol) {
    state.selectedSymbol = symbol;
    $('searchInput').value = symbol;
    analyzeSymbol(symbol); // AI evidence updates in the right panel
    switchView('chart');   // candlestick chart always opens in the center
}

// ==================== CHART (TradingView-style candles) ====================
let _chartInstance = null;
let _chartSymbol = null;
let _chartInterval = '1D';
async function renderChart() {
    const p = $('centerPanel');
    const symbol = state.selectedSymbol || 'RELIANCE';
    p.innerHTML = `
        <div style="padding:14px">
            <div class="section-title">Chart — <span style="font-family:var(--font-mono)">${symbol}</span>
                <span id="chartStatus" style="text-transform:none;letter-spacing:0;color:var(--text-muted)"></span></div>
            <div style="display:flex;gap:4px;margin-bottom:8px;align-items:center">
                ${['1m','5m','15m','1h','4h','1D','1W'].map(iv =>
                    `<button class="btn small ${iv === _chartInterval ? 'primary' : ''}" onclick="setChartInterval('${iv}')">${iv}</button>`).join('')}
                <div class="ohlc-bar" style="display:flex;gap:12px;margin-left:auto;font-family:var(--font-mono);font-size:11px;color:var(--text-secondary)" id="chartOHLC"></div>
            </div>
            <div id="tvchart-container" style="height:calc(100vh - 210px);min-height:320px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--bg-surface)"></div>
        </div>`;
    await loadChartData(symbol, _chartInterval);
}

function setChartInterval(iv) {
    _chartInterval = iv;
    const symbol = state.selectedSymbol || 'RELIANCE';
    loadChartData(symbol, iv);
    document.querySelectorAll('.btn.small').forEach(b => {
        if (['1m','5m','15m','1h','4h','1D','1W'].includes(b.textContent.trim())) b.classList.toggle('primary', b.textContent.trim() === iv);
    });
}

async function loadChartData(symbol, interval) {
    _chartSymbol = symbol;
    const st = $('chartStatus');
    if (st) st.textContent = 'loading…';
    const r = await api('/api/v2/history/' + encodeURIComponent(symbol) + '?interval=' + interval + '&limit=160');
    const candles = r.success && r.data && r.data.length ? r.data : [];
    if (st) st.textContent = candles.length ? `source: ${(candles[0].source||'demo').toUpperCase()}` : '';
    const container = $('tvchart-container');
    if (!container) return;

    if (_chartInstance) {
        try { _chartInstance.remove(); } catch (e) {}
        _chartInstance = null;
    }

    if (!candles.length) {
        container.innerHTML = '<div style="padding:30px;color:var(--text-muted);text-align:center">DATA UNAVAILABLE — no history for ' + symbol + ' at interval ' + interval + '</div>';
        return;
    }

    const chart = LightweightCharts.createChart(container, {
        layout: { background: { type: 'solid', color: '#111827' }, textColor: '#8b95a5', fontSize: 11, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' },
        grid: { vertLines: { color: 'rgba(30,41,59,.5)' }, horzLines: { color: 'rgba(30,41,59,.5)' } },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: 'rgba(59,130,246,.4)', style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#3b82f6' },
            horzLine: { color: 'rgba(59,130,246,.4)', style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#3b82f6' }
        },
        rightPriceScale: { borderColor: '#1e293b', scaleMargins: { top: 0.05, bottom: 0.22 } },
        timeScale: { borderColor: '#1e293b', timeVisible: interval.includes('m') || interval === '1h' || interval === '4h', secondsVisible: false },
        handleScroll: { vertTouchDrag: false }
    });
    _chartInstance = chart;

    const candleSeries = chart.addCandlestickSeries({
        upColor: '#00c853', downColor: '#ff3d3d', borderUpColor: '#00c853', borderDownColor: '#ff3d3d',
        wickUpColor: '#00c853', wickDownColor: '#ff3d3d'
    });
    const volSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    const cc = candles.map(c => ({ time: Math.floor(new Date(c.timestamp).getTime() / 1000), open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
    const vv = cc.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? 'rgba(0,200,83,.3)' : 'rgba(255,61,61,.3)' }));
    candleSeries.setData(cc);
    volSeries.setData(vv);
    chart.timeScale().fitContent();

    const ohlcEl = $('chartOHLC');
    if (ohlcEl) ohlcEl.innerHTML = '';
    const upd = (c) => {
        if (!ohlcEl || !c) return;
        const chg = c.close - c.open, pct = c.open > 0 ? (chg / c.open) * 100 : 0;
        const col = chg >= 0 ? 'var(--green)' : 'var(--red)';
        ohlcEl.innerHTML =
            `<span>O <b style="color:var(--text-primary)">${c.open.toFixed(2)}</b></span>` +
            `<span>H <b style="color:var(--green)">${c.high.toFixed(2)}</b></span>` +
            `<span>L <b style="color:var(--red)">${c.low.toFixed(2)}</b></span>` +
            `<span>C <b style="color:${col}">${c.close.toFixed(2)}</b></span>` +
            `<span style="color:${col}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)</span>`;
    };
    upd(cc[cc.length - 1]);
    chart.subscribeCrosshairMove((param) => {
        if (param && param.time && param.seriesData) {
            const d = param.seriesData.get(candleSeries);
            if (d) upd(d);
        } else upd(cc[cc.length - 1]);
    });

    const ro = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }));
    ro.observe(container);
}
