/**
 * ProTrader — chart/chart
 *
 * The trading workspace: a TradingView-style chart on the left of the split and
 * the order ticket on the right, so analysis and execution sit on one screen.
 *
 * Chart types (candles / line / area) are presentation over the same candles.
 * Overlays (EMA20/EMA50/Bollinger) and sub-panes (RSI/MACD) are computed by the
 * server's IndicatorEngine via /api/v2/indicators — the client never computes an
 * indicator itself, so the chart cannot disagree with the screener or the AI.
 */

const CHART_TYPES = [['candles', 'Candles'], ['line', 'Line'], ['area', 'Area']];
const CHART_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'];
const CHART_OVERLAYS = [['ema20', 'EMA 20'], ['ema50', 'EMA 50'], ['bb', 'Bollinger']];
const CHART_SUBS = [['volume', 'Volume'], ['rsi', 'RSI'], ['macd', 'MACD']];

const OVERLAY_COLORS = { ema20: '#22d3ee', ema50: '#a78bfa', bb: '#64748b' };

let _chartInstance = null;
let _subChart = null;
let _chartSymbol = null;
let _syncing = false;

// ==================== SYMBOL SELECT ====================
function selectSymbol(symbol) {
    state.selectedSymbol = symbol;
    const s = $('searchInput');
    if (s) s.value = symbol;
    analyzeSymbol(symbol);            // right panel evidence follows the selection
    switchView('chart');              // candles always open in the centre
}

// ==================== VIEW ====================
async function renderChart() {
    const p = $('centerPanel');
    if (!p) return;
    const symbol = state.selectedSymbol || state.instruments[0]?.symbol || 'RELIANCE';
    state.selectedSymbol = symbol;

    p.innerHTML = `
    <div class="split">
        <div class="split-main">
            <div class="chart-toolbar">
                <b class="mono" style="font-size:13px">${symbol}</b>
                <span class="badge gray" id="chartStatus">loading…</span>
                <div class="sep"></div>
                <div class="chart-tuning">
                    ${CHART_TYPES.map(([id, label]) =>
                        `<button class="btn small ${state.chart.type === id ? 'primary' : ''}" data-charttype="${id}" onclick="setChartType('${id}')">${label}</button>`).join('')}
                </div>
                <div class="sep"></div>
                <div class="chart-tuning">
                    ${CHART_INTERVALS.map(iv =>
                        `<button class="btn small ${state.chart.interval === iv ? 'primary' : ''}" data-interval="${iv}" onclick="setChartInterval('${iv}')">${iv}</button>`).join('')}
                </div>
                <div class="sep"></div>
                <div class="chart-tuning">
                    ${CHART_OVERLAYS.map(([id, label]) =>
                        `<button class="btn small ${state.chart.overlays[id] ? 'primary' : ''}" data-overlay="${id}" onclick="toggleOverlay('${id}')">${label}</button>`).join('')}
                </div>
                <div class="sep"></div>
                <div class="chart-tuning">
                    ${CHART_SUBS.map(([id, label]) =>
                        `<button class="btn small ${state.chart.sub === id ? 'primary' : ''}" data-sub="${id}" onclick="setSubPane('${id}')">${label}</button>`).join('')}
                </div>
                <div class="ohlc-bar" id="chartOHLC" style="margin-left:auto"></div>
            </div>

            <div class="chart-canvas-wrap">
                <div id="tvchart-container"></div>
                <div id="tvsub-container" style="display:none"></div>
            </div>
        </div>

        <div class="split-side">
            <div class="section-title" style="margin-top:0">Order ticket</div>
            <div id="ticketHost">${ticketHtml()}</div>

            <div class="section-title">Position</div>
            <div id="chartPosition"></div>

            <div class="section-title">Quick links</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn small" onclick="switchView('risk')">Risk terminal</button>
                <button class="btn small" onclick="switchView('regime')">Regime</button>
                <button class="btn small" onclick="switchView('strategies')">Strategy lab</button>
                <button class="btn small" onclick="switchView('reviews')">Trade reviews</button>
            </div>
        </div>
    </div>`;

    ticketChanged();
    renderChartPosition();
    await loadChartData(symbol, state.chart.interval);
    if (state.chart.sub !== 'volume') await loadIndicatorPane(symbol, state.chart.interval);
}

function setChartType(type) {
    state.chart.type = type;
    markActive('[data-charttype]', 'charttype', type);
    loadChartData(state.selectedSymbol, state.chart.interval);
}

function setChartInterval(iv) {
    state.chart.interval = iv;
    markActive('[data-interval]', 'interval', iv);
    loadChartData(state.selectedSymbol, iv);
    if (state.chart.sub !== 'volume') loadIndicatorPane(state.selectedSymbol, iv);
}

function toggleOverlay(name) {
    state.chart.overlays[name] = !state.chart.overlays[name];
    markActive('[data-overlay]', 'overlay', name);
    loadChartData(state.selectedSymbol, state.chart.interval);
}

function setSubPane(name) {
    state.chart.sub = name;
    markActive('[data-sub]', 'sub', name);
    const sub = $('tvsub-container');
    if (sub) sub.style.display = name === 'volume' ? 'none' : '';
    if (name === 'volume') { destroySubChart(); resizeCharts(); return; }
    loadIndicatorPane(state.selectedSymbol, state.chart.interval);
}

function markActive(selector, attr, value) {
    document.querySelectorAll(selector).forEach(b =>
        b.classList.toggle('primary', b.dataset[attr] === value)
    );
}

/** Live position card for the charted symbol, priced from the same account state. */
function renderChartPosition() {
    const el = $('chartPosition');
    if (!el) return;
    const pos = (state.account?.positions || []).find(x => x.symbol === state.selectedSymbol);
    if (!pos) {
        el.innerHTML = '<div class="mini-empty">No position in this instrument.</div>';
        return;
    }
    el.innerHTML = `
        <div class="ticket-summary">
            <div class="row"><span class="k">Quantity</span><span class="v">${pos.quantity}</span></div>
            <div class="row"><span class="k">Average price</span><span class="v">${fmt(pos.avgPrice)}</span></div>
            <div class="row"><span class="k">Last price</span><span class="v">${pos.currentPrice === null ? 'DATA UNAVAILABLE' : fmt(pos.currentPrice)}</span></div>
            <div class="row"><span class="k">Stop</span><span class="v">${pos.stopLoss ? fmt(pos.stopLoss) : 'none'}</span></div>
            <div class="row"><span class="k">Value</span><span class="v">${pos.marketValue === null ? '—' : '₹' + fmt(pos.marketValue)}</span></div>
            <div class="row"><span class="k">Unrealised</span><span class="v ${cls(pos.unrealizedPnl)}">${pos.unrealizedPnl === null ? '—' : '₹' + fmt(pos.unrealizedPnl)}</span></div>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn small" style="flex:1" onclick="quickClose('${pos.symbol}',${pos.quantity})">Close position</button>
            <button class="btn small" style="flex:1" onclick="promptStop('${pos.symbol}',${pos.stopLoss || 0})">Move stop</button>
        </div>`;
}

// ==================== SERIES ====================
async function loadChartData(symbol, interval) {
    _chartSymbol = symbol;
    const st = $('chartStatus');
    const container = $('tvchart-container');
    if (!container) return;
    if (st) st.textContent = 'loading…';

    const wantsIndicators = Object.values(state.chart.overlays).some(Boolean);
    const requests = [api('/api/v2/history/' + encodeURIComponent(symbol) + '?interval=' + interval + '&limit=200')];
    if (wantsIndicators) requests.push(api('/api/v2/indicators/' + encodeURIComponent(symbol) + '?interval=' + interval + '&limit=200&overlays=' +
        Object.keys(state.chart.overlays).filter(k => state.chart.overlays[k]).join(',')));

    const [histR, indR] = await Promise.all(requests);

    const candles = histR.success && Array.isArray(histR.data) ? histR.data.filter(c => isFinite(+c.close)) : [];
    if (st) st.textContent = candles.length ? `source: ${(candles[0].source || 'demo').toUpperCase()} · ${candles.length} bars` : 'no data';

    destroyChart();
    container.innerHTML = '';
    if (!candles.length) {
        container.innerHTML = `<div style="padding:30px;color:var(--text-muted);text-align:center">DATA UNAVAILABLE — no history for ${symbol} at ${interval}</div>`;
        return;
    }

    const chart = LightweightCharts.createChart(container, {
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#7d8a9e', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
        grid: { vertLines: { color: 'rgba(30,41,59,.45)' }, horzLines: { color: 'rgba(30,41,59,.45)' } },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: 'rgba(99,102,241,.45)', style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#6366f1' },
            horzLine: { color: 'rgba(99,102,241,.45)', style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#6366f1' }
        },
        rightPriceScale: { borderColor: '#1a2332', scaleMargins: { top: 0.06, bottom: 0.24 } },
        timeScale: { borderColor: '#1a2332', timeVisible: /m|h/.test(interval), secondsVisible: false },
        handleScroll: { vertTouchDrag: false },
        autoSize: false,
        width: container.clientWidth,
        height: container.clientHeight
    });
    _chartInstance = chart;

    const time = (c) => Math.floor(new Date(c.timestamp).getTime() / 1000);
    const ohlc = candles.map(c => ({ time: time(c), open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
    const closeLine = candles.map(c => ({ time: time(c), value: +c.close }));

    let priceSeries;
    if (state.chart.type === 'candles') {
        priceSeries = chart.addCandlestickSeries({
            upColor: '#10b981', downColor: '#ef4444', borderUpColor: '#10b981', borderDownColor: '#ef4444',
            wickUpColor: '#10b981', wickDownColor: '#ef4444'
        });
        priceSeries.setData(ohlc);
    } else if (state.chart.type === 'line') {
        priceSeries = chart.addLineSeries({ color: '#6366f1', lineWidth: 2 });
        priceSeries.setData(closeLine);
    } else {
        priceSeries = chart.addAreaSeries({ lineColor: '#22d3ee', topColor: 'rgba(34,211,238,.28)', bottomColor: 'rgba(34,211,238,.02)', lineWidth: 2 });
        priceSeries.setData(closeLine);
    }

    // Volume always rides on the main chart, coloured by candle direction.
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume', priceLineVisible: false, lastValueVisible: false });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(candles.map(c => ({
        time: time(c),
        value: +(c.volume || 0),
        color: +c.close >= +c.open ? 'rgba(16,185,129,.32)' : 'rgba(239,68,68,.32)'
    })));

    // Server-computed overlays.
    const overlays = indR && indR.success ? indR.data.overlays : null;
    if (overlays) {
        const line = (points, color, width = 1, style) => {
            if (!points || !points.length) return;
            const s = chart.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, lineStyle: style });
            s.setData(points);
        };
        line(overlays.ema20, OVERLAY_COLORS.ema20, 2);
        line(overlays.ema50, OVERLAY_COLORS.ema50, 2);
        if (overlays.bbUpper) line(overlays.bbUpper, OVERLAY_COLORS.bb, 1, LightweightCharts.LineStyle.Dashed);
        if (overlays.bbLower) line(overlays.bbLower, OVERLAY_COLORS.bb, 1, LightweightCharts.LineStyle.Dashed);
        if (overlays.bbMiddle) line(overlays.bbMiddle, OVERLAY_COLORS.bb, 1);
    } else if (wantsIndicators) {
        const badge = $('chartStatus');
        if (badge) badge.textContent += ' · overlays unavailable';
    }

    chart.timeScale().fitContent();

    // OHLC readout
    const ohlcEl = $('chartOHLC');
    const upd = (c) => {
        if (!ohlcEl || !c) return;
        const chg = c.close - c.open, pct = c.open ? (chg / c.open) * 100 : 0;
        const col = chg >= 0 ? 'var(--green)' : 'var(--red)';
        ohlcEl.innerHTML =
            `<span>O <b style="color:var(--text-primary)">${c.open.toFixed(2)}</b></span>` +
            `<span>H <b style="color:var(--green)">${c.high.toFixed(2)}</b></span>` +
            `<span>L <b style="color:var(--red)">${c.low.toFixed(2)}</b></span>` +
            `<span>C <b style="color:${col}">${c.close.toFixed(2)}</b></span>` +
            `<span style="color:${col}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)</span>`;
    };
    const last = ohlc[ohlc.length - 1];
    upd({ open: last.open, high: last.high, low: last.low, close: last.close });
    chart.subscribeCrosshairMove((param) => {
        const d = param && param.time && param.seriesData ? param.seriesData.get(priceSeries) : null;
        if (d && d.close !== undefined) upd(d);
        else if (d && d.value !== undefined) upd({ open: d.value, high: d.value, low: d.value, close: d.value });
        else upd({ open: last.open, high: last.high, low: last.low, close: last.close });
    });

    resizeCharts();
    window.addEventListener('resize', resizeCharts);
}

/** RSI / MACD pane below the price chart, time-synced to it. */
async function loadIndicatorPane(symbol, interval) {
    const container = $('tvsub-container');
    if (!container) return;
    container.style.display = '';
    container.innerHTML = '<div style="padding:18px;color:var(--text-muted);font-size:11px">Loading ' + state.chart.sub.toUpperCase() + '…</div>';

    const r = await api('/api/v2/indicators/' + encodeURIComponent(symbol) + '?interval=' + interval + '&limit=200&sub=' + state.chart.sub);
    const pane = r.success ? r.data.panes[state.chart.sub] : null;

    destroySubChart();
    container.innerHTML = '';
    if (!pane || !pane.length) {
        container.innerHTML = '<div style="padding:18px;color:var(--text-muted);font-size:11px">DATA UNAVAILABLE — ' + state.chart.sub.toUpperCase() + ' needs more bars than the feed returned (' + (r.error || 'insufficient history') + ')</div>';
        return;
    }

    const sub = LightweightCharts.createChart(container, {
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#7d8a9e', fontSize: 10 },
        grid: { vertLines: { color: 'rgba(30,41,59,.35)' }, horzLines: { color: 'rgba(30,41,59,.35)' } },
        rightPriceScale: { borderColor: '#1a2332' },
        timeScale: { borderColor: '#1a2332', timeVisible: /m|h/.test(interval), secondsVisible: false, visible: false },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        handleScroll: { vertTouchDrag: false },
        width: container.clientWidth,
        height: container.clientHeight
    });
    _subChart = sub;

    if (state.chart.sub === 'rsi') {
        const s = sub.addLineSeries({ color: '#a78bfa', lineWidth: 2, priceLineVisible: false });
        s.setData(pane);
        s.createPriceLine({ price: 70, color: 'rgba(239,68,68,.5)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true });
        s.createPriceLine({ price: 30, color: 'rgba(16,185,129,.5)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true });
    } else {
        const hist = sub.addHistogramSeries({ priceLineVisible: false });
        hist.setData(pane.filter(p => p.histogram !== undefined).map(p => ({ time: p.time, value: p.histogram, color: p.histogram >= 0 ? 'rgba(16,185,129,.5)' : 'rgba(239,68,68,.5)' })));
        const macd = sub.addLineSeries({ color: '#22d3ee', lineWidth: 2, priceLineVisible: false });
        macd.setData(pane.filter(p => p.macd !== undefined).map(p => ({ time: p.time, value: p.macd })));
        const sig = sub.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false });
        sig.setData(pane.filter(p => p.signal !== undefined).map(p => ({ time: p.time, value: p.signal })));
    }

    sub.timeScale().fitContent();
    syncTimeScales();
    resizeCharts();
}

function syncTimeScales() {
    if (!_chartInstance || !_subChart) return;
    const link = (from, to) => from.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (_syncing || !range) return;
        _syncing = true;
        try { to.timeScale().setVisibleLogicalRange(range); } catch (e) { /* range out of step */ }
        _syncing = false;
    });
    link(_chartInstance, _subChart);
    link(_subChart, _chartInstance);
}

function destroyChart() {
    if (_chartInstance) { try { _chartInstance.remove(); } catch (e) { /* already gone */ } _chartInstance = null; }
}
function destroySubChart() {
    if (_subChart) { try { _subChart.remove(); } catch (e) { /* already gone */ } _subChart = null; }
}

/** Called by the layout resizers and on window resize. */
function resizeCharts() {
    const main = $('tvchart-container');
    const sub = $('tvsub-container');
    if (_chartInstance && main) _chartInstance.applyOptions({ width: main.clientWidth, height: main.clientHeight });
    if (_subChart && sub && sub.style.display !== 'none') _subChart.applyOptions({ width: sub.clientWidth, height: sub.clientHeight });
}
