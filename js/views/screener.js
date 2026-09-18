/**
 * ProTrader — views/screener
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== SCREENER ====================
async function renderScreener() {
    const p = $('centerPanel');
    const defsR = await api('/api/v2/screen/filters');
    const defs = defsR.success ? defsR.data : { static: [], technical: [] };
    const allDefs = [...(defs.static || []), ...(defs.technical || [])];

    p.innerHTML = `
        <div style="padding:16px">
            <div class="section-title">Filter Builder <span style="text-transform:none;letter-spacing:0;color:var(--text-muted)">— combine conditions with AND</span></div>
            <div id="filterRows"></div>
            <div style="display:flex;gap:8px;margin:10px 0">
                <button class="btn small" onclick="addFilterRow()">+ Add filter</button>
                <button class="btn small primary" onclick="runScreen()">▶ Run Screen</button>
                <button class="btn small" onclick="saveScreen()">💾 Save</button>
            </div>
            <div class="section-title">Results</div>
            <div id="screenResults"><div style="color:var(--text-muted);padding:20px;text-align:center">Add filters and run the screen.</div></div>
        </div>`;

    state.filterDefs = allDefs;
    renderFilterRows();

    // A palette screen shortcut sets this flag before switching here, so the
    // run happens after the results container exists — no timer race.
    if (state.pendingScreen) { state.pendingScreen = false; runScreen(); }
}

function renderFilterRows() {
    const defs = state.filterDefs || [];
    const rowsEl = $('filterRows');
    if (!rowsEl) return;
    rowsEl.innerHTML = state.filters.map((f, idx) => `
        <div class="filter-row" data-idx="${idx}">
            <select onchange="updateFilter(${idx},'field',this.value)">
                <option value="">— field —</option>
                ${defs.map(d => `<option value="${d.field}" ${d.field===f.field?'selected':''}>${d.label || d.field}</option>`).join('')}
            </select>
            <select onchange="updateFilter(${idx},'operator',this.value)">
                <option value=">" ${f.operator==='>'?'selected':''}>&gt;</option>
                <option value=">=" ${f.operator==='>='?'selected':''}>&ge;</option>
                <option value="<" ${f.operator==='<'?'selected':''}>&lt;</option>
                <option value="<=" ${f.operator==='<='?'selected':''}>&le;</option>
                <option value="=" ${f.operator==='='?'selected':''}>=</option>
                <option value="!=" ${f.operator==='!='?'selected':''}>&ne;</option>
                <option value="contains" ${f.operator==='contains'?'selected':''}>contains</option>
            </select>
            <input type="text" value="${f.value ?? ''}" onchange="updateFilter(${idx},'value',this.value)" style="width:120px">
            <button class="btn small danger" onclick="removeFilter(${idx})">✕</button>
        </div>`).join('');
}

function updateFilter(idx, key, val) {
    state.filters[idx][key] = key === 'value' && !isNaN(parseFloat(val)) ? parseFloat(val) : val;
}
function removeFilter(idx) { state.filters.splice(idx, 1); renderFilterRows(); }
function addFilterRow() { state.filters.push({ field: 'rsi', operator: '<', value: 30 }); renderFilterRows(); }

async function runScreen() {
    const resultsEl = $('screenResults');
    if (!resultsEl) return;
    resultsEl.innerHTML = '<div style="color:var(--text-secondary);padding:10px">Running screen...</div>';
    const r = await api('/api/v2/screen', 'POST', { filters: state.filters.filter(f => f.field) });
    if (!r.success) { resultsEl.innerHTML = `<div style="color:var(--red)">${r.error}</div>`; return; }
    if (!r.data.length) { resultsEl.innerHTML = '<div style="color:var(--text-muted);padding:10px">No instruments match these filters.</div>'; return; }
    // Show the technical values the screen actually filtered on. Missing
    // metrics render as an explicit "—" (DATA UNAVAILABLE) rather than a
    // plausible-looking number.
    const hasTech = r.data.some(i => i._technicalData);
    const techCell = (v, dp = 2) => (typeof v === 'number' && isFinite(v))
        ? v.toFixed(dp)
        : '<span title="DATA UNAVAILABLE" style="color:var(--text-muted)">—</span>';
    const srcBadge = i => {
        const p = i.dataProvenance || {};
        const q = p.quality || '—';
        const color = q === 'LIVE' || q === 'REALTIME' ? 'green' : (q === 'DEMO' ? 'orange' : 'blue');
        return `<span class="badge ${color}" title="source: ${p.source || 'unknown'} · ${p.bars || 0} bars">${q}</span>`;
    };

    resultsEl.innerHTML = `
        <table>
            <thead><tr>
                <th>Symbol</th><th>Company</th><th>Sector</th>
                ${hasTech ? '<th style="text-align:right">Price</th><th style="text-align:right">RSI</th><th style="text-align:right">1D %</th><th style="text-align:right">Rel Vol</th><th>Data</th>' : '<th>Exchange</th>'}
            </tr></thead>
            <tbody>
            ${r.data.map(i => {
                const t = i._technicalData || {};
                const chg = t.change1D;
                return `
                <tr onclick="showScreenerChart('${i.symbol}')" style="cursor:pointer">
                    <td style="font-weight:600">${i.symbol}</td>
                    <td style="font-family:var(--font-sans)">${i.companyName}</td>
                    <td style="font-family:var(--font-sans)">${i.sector}</td>
                    ${hasTech ? `
                        <td style="text-align:right">${techCell(t.price)}</td>
                        <td style="text-align:right;color:${t.rsi > 70 ? 'var(--red)' : (t.rsi < 30 ? 'var(--green)' : 'var(--text-primary)')}">${techCell(t.rsi, 1)}</td>
                        <td style="text-align:right" class="${typeof chg === 'number' ? cls(chg) : ''}">${typeof chg === 'number' ? sign(chg) + '%' : techCell(null)}</td>
                        <td style="text-align:right">${typeof t.relativeVolume === 'number' ? t.relativeVolume.toFixed(2) + 'x' : techCell(null)}</td>
                        <td>${srcBadge(i)}</td>` : `<td>${i.exchange}</td>`}
                </tr>`;
            }).join('')}
            </tbody>
        </table>
        <div style="color:var(--text-muted);font-size:11px;padding:8px 0">${r.data.length} results — click a row to see chart${hasTech ? ' · technicals computed from daily candles; — means the metric is unavailable' : ''}</div>
        <div id="screenerChartWrap" style="display:none">
            <div class="section-title" id="screenerChartTitle" style="margin-top:12px"></div>
            <div id="screenerChartContainer" style="height:360px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--bg-surface)"></div>
        </div>`;
}

let _screenerChart = null;
let _screenerVolSeries = null;
let _screenerCandleSeries = null;

async function showScreenerChart(symbol) {
    state.selectedSymbol = symbol;
    $('searchInput').value = symbol;
    const wrap = $('screenerChartWrap');
    const title = $('screenerChartTitle');
    const container = $('screenerChartContainer');
    if (!wrap || !container) return;
    wrap.style.display = 'block';
    title.innerHTML = `Chart — <span style="font-family:var(--font-mono)">${symbol}</span>`;
    if (_screenerChart) { try { _screenerChart.remove(); } catch(e){} _screenerChart = null; }
    container.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center">Loading chart…</div>';
    const r = await api('/api/v2/history/' + encodeURIComponent(symbol) + '?interval=1D&limit=120');
    const candles = r.success && r.data && r.data.length ? r.data : [];
    if (!candles.length) {
        container.innerHTML = '<div style="padding:30px;color:var(--text-muted);text-align:center">DATA UNAVAILABLE — no history for ' + symbol + '</div>';
        return;
    }
    container.innerHTML = '';
    const chart = LightweightCharts.createChart(container, {
        layout: { background: { type: 'solid', color: '#111827' }, textColor: '#8b95a5', fontSize: 11, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' },
        grid: { vertLines: { color: 'rgba(30,41,59,.5)' }, horzLines: { color: 'rgba(30,41,59,.5)' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1e293b', scaleMargins: { top: 0.05, bottom: 0.22 } },
        timeScale: { borderColor: '#1e293b', timeVisible: false, secondsVisible: false },
        handleScroll: { vertTouchDrag: false }
    });
    _screenerChart = chart;
    _screenerCandleSeries = chart.addCandlestickSeries({ upColor: '#00c853', downColor: '#ff3d3d', borderUpColor: '#00c853', borderDownColor: '#ff3d3d', wickUpColor: '#00c853', wickDownColor: '#ff3d3d' });
    _screenerVolSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const cc = candles.map(c => ({ time: Math.floor(new Date(c.timestamp).getTime() / 1000), open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
    const vv = cc.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? 'rgba(0,200,83,.3)' : 'rgba(255,61,61,.3)' }));
    _screenerCandleSeries.setData(cc);
    _screenerVolSeries.setData(vv);
    chart.timeScale().fitContent();
    analyzeSymbol(symbol);
    const ro = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }));
    ro.observe(container);
}

async function saveScreen() {
    const r = await api('/api/v2/screen/save', 'POST', { name: 'Custom ' + new Date().toLocaleTimeString(), filters: state.filters.filter(f => f.field) });
    if (r.success) alert('Screen saved!');
}
